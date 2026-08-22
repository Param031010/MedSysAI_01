from pymongo import MongoClient
from pymongo.database import Database

from app.config import settings

_client: MongoClient | None = None


def get_db() -> Database:
    """Lazy MongoDB Compass (local) connection, shared across requests."""
    global _client
    if _client is None:
        _client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
    return _client[settings.mongodb_db]
