import os
import requests
import discord
from discord.ext import commands
import re
import random
import string
from discord import Embed, app_commands
from flask import Flask, request, render_template, redirect, url_for, session, jsonify, make_response
from flask_session import Session
from dotenv import load_dotenv
from flask_cors import CORS
import threading
import asyncio
from datetime import datetime, timedelta, timezone
import jwt as pyjwt
import logging

load_dotenv()
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ['SECRET_KEY']
app.config['SESSION_TYPE'] = 'filesystem'

Session(app)

# Configure CORS to allow credentials and specify the allowed origin
CORS(app, resources={r"/api/*": {"origins": ["https://savingshub.watch", "https://savingshub.cloud"], "supports_credentials": True}})

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        response = make_response()
        headers = response.headers

        headers['Access-Control-Allow-Origin'] = request.headers.get('Origin')
        headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, PUT, DELETE'
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        headers['Access-Control-Allow-Credentials'] = 'true'
        
        return response

# Ensure CORS headers are set for all responses
@app.after_request
def set_cors_headers(response):
    origin = request.headers.get('Origin')
    logging.debug(f"Request origin: {origin}")
    if origin in ["https://savingshub.watch", "https://savingshub.cloud"]:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        logging.debug(f"Set CORS headers for origin: {origin}")
    else:
        logging.debug(f"Origin not allowed: {origin}")
    return response


intents = discord.Intents.default()
intents.members = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

logging_channel_id = int(os.getenv('LOGGING_CHANNEL_ID', 0))

def generate_token(user_data):
    expiration = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {"user": user_data, "exp": expiration}
    return pyjwt.encode(payload, app.config['SECRET_KEY'], algorithm="HS256")

@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/auth/discord')
def auth_discord():
    auth_url = (
        f'https://discord.com/api/oauth2/authorize?client_id={os.environ["DISCORD_CLIENT_ID"]}'
        f'&redirect_uri={os.environ["REDIRECT_URI"]}&response_type=code&scope=identify%20guilds.join%20email%20connections'
    )
    return redirect(auth_url)

@app.route('/auth/discord/callback')
def auth_discord_callback():
    code = request.args.get('code')
    token_data = get_token_data(code)
    user_data = get_user_data(token_data["access_token"])

    guild = client.get_guild(int(os.environ['GUILD_ID']))
    member = guild.get_member(int(user_data['id']))
    required_role = guild.get_role(int(os.environ['ROLE_ID']))

    if not member or not required_role or required_role not in member.roles:
        send_log(f'Authentication failed for user {user_data["username"]}#{user_data["discriminator"]}')
        return redirect(url_for('auth_failed'))

    connections = get_connections(token_data['access_token'])
    user = create_user_session(user_data, member, connections)
    session['user'] = user
    
    jwt_token = generate_token(user)
    send_log(f'User: {user} authenticated successfully.')
    
    response = redirect(url_for('dashboard'))
    response.set_cookie('auth_token', jwt_token, httponly=True, secure=True, samesite='None', max_age=86400)
    
    return response

@app.route('/api/user')
def api_user():
    token = request.cookies.get('auth_token') or request.args.get('token')
    
    logging.debug(f"Received token: {token}")
    logging.debug(f"Request headers: {request.headers}")
    logging.debug(f"Request cookies: {request.cookies}")

    if not token:
        return jsonify({'error': 'No token provided'}), 401
    
    try:
        decoded = pyjwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        user = decoded['user']
        
        # Perform role check for each request
        guild = client.get_guild(int(os.environ['GUILD_ID']))
        member = guild.get_member(int(user['id']))
        required_role = guild.get_role(int(os.environ['ROLE_ID']))

        if not member or not required_role or required_role not in member.roles:
            return jsonify({'error': 'User does not have the required role or is not a member of the guild'}), 403

        return jsonify(user), 200
    except pyjwt.ExpiredSignatureError:
        return jsonify({'error': 'Token has expired'}), 401
    except pyjwt.InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('index'))
    return render_template('dashboard.html', user=session['user'])

@app.route('/logout')
def logout():
    session.pop('user', None)
    response = redirect(url_for('index'))
    response.delete_cookie('auth_token')
    return response

@app.route('/auth-failed')
def auth_failed():
    return render_template('auth-failed.html')

def get_token_data(code):
    token_url = 'https://discord.com/api/oauth2/token'
    data = {
        'client_id': os.environ['DISCORD_CLIENT_ID'],
        'client_secret': os.environ['DISCORD_CLIENT_SECRET'],
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': os.environ['REDIRECT_URI'],
        'scope': 'identify guilds.join email connections'
    }
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    response = requests.post(token_url, data=data, headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to obtain token: {response.text}")

def get_user_data(access_token):
    user_url = 'https://discord.com/api/users/@me'
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(user_url, headers=headers)
    return response.json()

def get_connections(access_token):
    url = 'https://discord.com/api/users/@me/connections'
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get(url, headers=headers)
    return response.json()

def create_user_session(user_data, member, connections):
    return {
        'id': user_data['id'],
        'username': user_data['username'],
        'discriminator': user_data['discriminator'],
        'email': user_data['email'],
        'avatar': f'https://cdn.discordapp.com/avatars/{user_data["id"]}/{user_data["avatar"]}.png',
        'joined_at': str(member.joined_at),
        'nickname': member.nick,
        'roles': [role.name for role in member.roles],
        'nitro': user_data.get('premium_type') is not None,
        'connections': [conn['type'] for conn in connections],
        'guilds': [g.name for g in client.guilds],
        'extra_info': 'Extra information you want to include',
        'locale': user_data.get('locale'),
        'mfa_enabled': 'mfa_enabled' in user_data and user_data['mfa_enabled'],
        'verified': 'verified' in user_data and user_data['verified']
    }

def send_log(message):
    if logging_channel_id:
        channel = client.get_channel(logging_channel_id)
        if channel:
            embed = Embed(title="Log Message", description=message, color=discord.Color.blue())
            asyncio.run_coroutine_threadsafe(channel.send(embed=embed), client.loop)

async def set_bot_presence():
    status = discord.Status.dnd
    activity = discord.Activity(type=discord.ActivityType.watching, name="Savings Hub Security")
    await client.change_presence(status=status, activity=activity)

@client.event
async def on_ready():
    await set_bot_presence()
    client.loop.create_task(sync_commands_periodically())

@tree.command(name="api", description="Check the API status")
async def api(interaction: discord.Interaction):
    with app.app_context():
        endpoints = [
            {'url': 'https://savingshub.cloud', 'name': 'Index'},
            {'url': "https://savingshub.cloud/auth/discord", 'name': 'Auth Discord'},
            {'url': 'https://savingshub.cloud/api/user', 'name': 'API User'},
        ]
    statuses = []

    for endpoint in endpoints:
        try:
            response = requests.get(endpoint['url'])
            status = f"{endpoint['name']} - {response.status_code} - OK" if response.status_code == 200 else f"{endpoint['name']} - {response.status_code} - FAIL"
        except Exception as e:
            status = f"{endpoint['name']} - ERROR - {str(e)}"
        statuses.append(status)

    description = "\n".join(statuses)
    color = discord.Color.green() if all("OK" in status for status in statuses) else discord.Color.red()
    embed = Embed(title="API Status", description=description, color=color)
    await interaction.response.send_message(embed=embed)

def generate_token(user_data):
    expiration = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {"user": user_data, "exp": expiration}
    return pyjwt.encode(payload, app.config['SECRET_KEY'], algorithm="HS256")

# Simple token generation and validation for mobile
active_tokens = {}

# List to store used words
used_words = []

# Function to generate a simple word
def generate_simple_word(min_length=3, max_length=8):
    vowels = 'aeiou'
    consonants = 'bcdfghjklmnpqrstvwxyz'
    
    length = random.randint(min_length, max_length)
    word = ''
    
    for i in range(length):
        if i % 2 == 0:
            word += random.choice(consonants)
        else:
            word += random.choice(vowels)
    
    return word

def create_one_time_token():
    while True:
        token = generate_simple_word()
        if token not in used_words:
            used_words.append(token)
            return token

@app.route('/api/validate_token/<token>', methods=['GET'])
def validate_token(token):
    if token in used_words:
        used_words.remove(token)
        return jsonify({"status": "true"})
    return jsonify({"status": "false"})

@tree.command(name="generatetoken", description="Generate a one-time token for mobile-only login")
async def generatetoken(interaction: discord.Interaction):
    required_role = discord.utils.get(interaction.guild.roles, id=int(os.getenv('ROLE_ID')))
    if required_role not in interaction.user.roles:
        await interaction.response.send_message("You don't have the right role for this.", ephemeral=True)
        return
    
    token = create_one_time_token()

    try:
        await interaction.response.send_message(f"Your one-time token: `{token}`. Valid for one use.", ephemeral=True)
    except discord.Forbidden:
        await interaction.response.send_message(f"Your one-time token: `{token}`. Valid for one use.", ephemeral=True)

@tree.command(name="checkbot", description="Check the bot status")
async def checkbot(interaction: discord.Interaction):
    try:
        guild = client.get_guild(int(os.environ['GUILD_ID']))
        if guild:
            status = "Bot status: OK"
            color = discord.Color.green()
        else:
            status = "Bot status: FAIL - Not in guild"
            color = discord.Color.red()
    except Exception as e:
        status = f"Bot status: ERROR - {str(e)}"
        color = discord.Color.red()
    
    embed = Embed(title="Bot Status", description=status, color=color)
    await interaction.response.send_message(embed=embed)

@tree.command(name="help", description="Get the list of available commands")
async def help(interaction: discord.Interaction):
    embed = Embed(
        title="Help Menu",
        description="Available commands: /api, /checkbot, /help, /params, /generatetoken",
        color=discord.Color.blue()
    )
    await interaction.response.send_message(embed=embed)

@tree.command(name="params", description="Show details of collected user parameters")
async def params(interaction: discord.Interaction):
    user_params = {
        "id": "User ID",
        "username": "Discord username",
        "discriminator": "Discord discriminator",
        "email": "User email",
        "avatar": "User avatar URL",
        "joined_at": "Guild join date",
        "nickname": "Guild nickname",
        "roles": "Guild roles",
        "nitro": "Has Nitro subscription",
        "connections": "Connected accounts",
        "guilds": "Guilds bot is in",
        "extra_info": "Extra information",
        "locale": "User locale",
        "mfa_enabled": "MFA enabled",
        "verified": "Email verified"
    }

    params_description = "\n".join([f"**{key}**: {description}" for key, description in user_params.items()])
    embed = Embed(
        title="Collected User Parameters",
        description=params_description,
        color=discord.Color.blurple()
    )
    
    await interaction.response.defer()
    await interaction.followup.send(embed=embed)

async def sync_commands_periodically():
    while True:
        try:
            await tree.sync()
        except Exception as e:
            pass
        await asyncio.sleep(3600)  # Sync commands every hour

def run_discord_bot():
    client.run(os.environ['DISCORD_BOT_TOKEN'])

def run_flask_app():
    from waitress import serve
    serve(app, host='0.0.0.0', port=int(os.environ['PORT']))

if __name__ == '__main__':
    discord_thread = threading.Thread(target=run_discord_bot)
    discord_thread.start()

    flask_thread = threading.Thread(target=run_flask_app)
    flask_thread.start()
