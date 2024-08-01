import os
import logging
import threading
from server import app, run_discord_bot

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    port = int(os.environ.get('PORT', 443)) 
    logging.info(f"Starting server on port {port}")
    bot_thread = threading.Thread(target=run_discord_bot)
    bot_thread.start()
    from waitress import serve
    try:
        serve(app, host='0.0.0.0', port=port)
    except Exception as e:
        logging.error(f"Error starting server: {e}")