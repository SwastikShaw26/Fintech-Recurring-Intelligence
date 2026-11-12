import os

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from src.hosted_storage import metadata

url = os.environ["FINSIGHT_HOSTED_DATABASE_URL"]

if context.is_offline_mode():
    context.configure(url=url, target_metadata=metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=NullPool, hide_parameters=True)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
