from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, facilities, health, home, mydata, profile, symptoms
from app.services.clerk_auth import require_clerk_auth

app = FastAPI(title="MedSys AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# `health` stays public (no user data, just a reachability/model-status probe).
# Every other router requires a valid Clerk session JWT.
auth_dep = [Depends(require_clerk_auth)]

app.include_router(health.router)
app.include_router(home.router, dependencies=auth_dep)
app.include_router(chat.router, dependencies=auth_dep)
app.include_router(facilities.router, dependencies=auth_dep)
app.include_router(profile.router, dependencies=auth_dep)
app.include_router(symptoms.router, dependencies=auth_dep)
app.include_router(mydata.router, dependencies=auth_dep)
