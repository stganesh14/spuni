from fastapi import APIRouter

from app.api.routes import account, auth, catalog, engagement, shop
from app.api.routes.admin import catalog as admin_catalog
from app.api.routes.admin import operations as admin_operations

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(auth.admin_router)
api_router.include_router(catalog.router)
api_router.include_router(shop.router)
api_router.include_router(account.router)
api_router.include_router(account.public_router)
api_router.include_router(engagement.router)
api_router.include_router(admin_catalog.router)
api_router.include_router(admin_operations.router)
