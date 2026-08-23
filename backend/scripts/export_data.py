"""1-Click Database Exporter for MedSysAI.

Exports all MongoDB collections (profiles, symptom history, chat sessions,
chat messages, medical records, knowledge graphs) into a portable JSON backup.
"""

import json
import os
from datetime import datetime
from bson import ObjectId
from app.db import get_db

BACKUP_FILE = "medsys_backup.json"


class MongoEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle BSON ObjectIds and Datetimes."""
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


def export_database():
    db = get_db()
    collections = db.list_collection_names()
    print(f"[EXPORT] Found {len(collections)} collections in MedSysAI database...")

    backup_data = {}
    total_docs = 0

    for coll_name in collections:
        if coll_name.startswith("system."):
            continue
        docs = list(db[coll_name].find())
        backup_data[coll_name] = docs
        total_docs += len(docs)
        print(f"  * Exported {len(docs)} documents from '{coll_name}'")

    with open(BACKUP_FILE, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, cls=MongoEncoder, indent=2)

    abs_path = os.path.abspath(BACKUP_FILE)
    print("\n=================================================================")
    print(f"[OK] EXPORT COMPLETE! Total Documents Saved: {total_docs}")
    print(f"File Location: {abs_path}")
    print("=================================================================")
    print("INSTRUCTIONS TO MOVE TO ANOTHER SYSTEM:")
    print("1. Copy 'medsys_backup.json' to your new computer's backend folder.")
    print("2. Run: python -m scripts.import_data")
    print("=================================================================\n")


if __name__ == "__main__":
    export_database()
