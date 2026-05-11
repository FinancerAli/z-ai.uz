import os
import sys

# add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.agents.registry import get_agent_registry, sync_agents_to_db
from app.db.session import SessionLocal

db = SessionLocal()
try:
    sync_agents_to_db(get_agent_registry(), db)
    print("Successfully synced agents to DB")
except Exception as e:
    print(f"Error syncing agents: {e}")
finally:
    db.close()
