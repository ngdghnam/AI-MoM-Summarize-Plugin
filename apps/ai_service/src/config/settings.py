from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    PORT: int
    HOST: str

    class Config:
        env_file = Path(__file__).resolve().parent.parent.parent / ".env"

settings = Settings()