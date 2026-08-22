"""One-off seed for the demo cardiac-risk pattern used on the Home dashboard.

Run once after setting SUPERMEMORY_API_KEY:
    python scripts/seed_symptoms.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.supermemory_client import log_symptom  # noqa: E402


async def main() -> None:
    await log_symptom("chest pain", "2026-08-17")
    await log_symptom("night sweats", "2026-08-20")
    print("Seeded demo symptoms: chest pain (Aug 17), night sweats (Aug 20).")


if __name__ == "__main__":
    asyncio.run(main())
