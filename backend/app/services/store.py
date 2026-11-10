from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StoreSettings


async def get_store_settings(db: AsyncSession, *, for_update: bool = False) -> StoreSettings:
    query = select(StoreSettings).where(StoreSettings.id == 1)
    if for_update:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if row is None:
        await db.execute(insert(StoreSettings).values(id=1).on_conflict_do_nothing())
        await db.flush()
        row = (await db.execute(query)).scalar_one()
    return row
