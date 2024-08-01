import os
import discord
import logging
import aiohttp
from dotenv import load_dotenv
import asyncio

load_dotenv()

intents = discord.Intents.default()
client = discord.Client(intents=intents)

logging.basicConfig(level=logging.INFO)

# List of command IDs you want to remove (add the command IDs here)
command_ids_to_remove = [
    1258217701806051420,  # Replace with actual command ID
    1260296966542327831,  # Replace with actual command ID
    1258217701806051419,
    1260296966542327832,
    1258217701806051422,
    1260296966542327833,
    1258217701806051421,
    1260296966542327834,
]

async def remove_specific_commands():
    await client.wait_until_ready()
    logging.info("Fetching commands...")
    guild_id = int(os.getenv('GUILD_ID'))
    application_id = client.user.id

    if guild_id is None:
        logging.error(f"Guild ID not found.")
        return

    headers = {
        "Authorization": f"Bot {os.getenv('DISCORD_BOT_TOKEN')}"
    }

    async with aiohttp.ClientSession() as session:
        for command_id in command_ids_to_remove:
            url = f"https://discord.com/api/v10/applications/{application_id}/guilds/{guild_id}/commands/{command_id}"
            async with session.delete(url, headers=headers) as response:
                if response.status == 204:
                    logging.info(f"Removed command ID: {command_id}")
                elif response.status == 404:
                    logging.warning(f"Command ID {command_id} not found.")
                elif response.status == 429:
                    retry_after = int(response.headers.get("Retry-After", 5))
                    logging.warning(f"Rate limited. Retrying after {retry_after} seconds.")
                    await asyncio.sleep(retry_after)
                    async with session.delete(url, headers=headers) as retry_response:
                        if retry_response.status == 204:
                            logging.info(f"Removed command ID: {command_id} after retry.")
                        else:
                            logging.error(f"Failed to remove command ID {command_id} after retry: {retry_response.status}")
                else:
                    logging.error(f"Failed to remove command ID {command_id}: {response.status}")

    logging.info("Specified commands removed. You can now restart your bot to reinitialize commands.")
    await client.close()

@client.event
async def on_ready():
    logging.info(f"Logged in as {client.user} (ID: {client.user.id})")
    await remove_specific_commands()

client.run(os.getenv('DISCORD_BOT_TOKEN'))