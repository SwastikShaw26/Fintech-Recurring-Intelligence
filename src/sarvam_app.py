
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api import app as finsight_app
from src.assistant_routes import router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with finsight_app.router.lifespan_context(finsight_app) as state:
        yield state


app = FastAPI(
    title="FinSight with Sarvam AI",
    lifespan=lifespan,
)

# Register Sarvam before mounting the existing application.
app.include_router(router)

# Preserve the existing FinSight API and frontend.
app.mount("/", finsight_app)
