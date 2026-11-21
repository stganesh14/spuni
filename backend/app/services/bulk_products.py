"""Excel template and parsing for admin bulk product creation."""

from collections import OrderedDict
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.worksheet.datavalidation import DataValidation

from app.core.errors import AppError

HEADERS = (
    "category_slug",
    "subcategory_slug",
    "name",
    "slug",
    "sku",
    "short_description",
    "description",
    "price_rupees",
    "compare_at_price_rupees",
    "stock",
    "gender",
    "material",
    "color",
    "dimensions",
    "weight_grams",
    "care_instructions",
    "badge",
    "is_active",
    "is_featured",
    "is_bestseller",
    "is_customizable",
    "sort_order",
    "meta_title",
    "meta_description",
    "color_name",
    "color_hex",
    "common_images",
    "color_images",
)

MAX_ROWS = 3000
MAX_PRODUCTS = 300


def build_template() -> bytes:
    workbook = Workbook()
    instructions = workbook.active
    instructions.title = "Instructions"
    instructions.append(["SPUNI — Bulk product upload"])
    instructions.append(["Follow these steps before uploading your workbook and product images."])
    instructions.append([])
    steps = [
        ("1. Prepare products", "Use one row for each color option. A product with 3 colors must have 3 rows. "
         "A product with no colors uses one row."),
        ("2. Repeat product details", "On every row for one product, copy columns A:X exactly, including the same "
         "SKU and slug. Do not create a new SKU for each color."),
        ("3. Add colors", "On each color row, enter that color's name and hex code in color_name and color_hex "
         "(for example Black / #171717, then Tan / #B87945). Change only the color and color_images fields "
         "between rows. Leave color fields blank for a product without colors."),
        ("4. Add images", "Choose product images as separate files. Put shared image filenames in common_images "
         "and color-specific filenames in color_images. Separate multiple filenames with semicolons (;) "
         "and use the exact filenames."),
        ("5. Shared vs color images", "Shared images are attached to the whole product. Color images are attached "
         "only to that row's color. Put shared filenames on the first row for the product; they are also "
         "accepted on other rows and will be deduplicated."),
        ("6. Upload images", "On the admin upload page, select this completed .xlsx file and all referenced "
         "JPEG, PNG or WebP images together. Images must be 8 MB or smaller each."),
        ("7. Categories", "Use existing category and subcategory slugs (not their display names). "
         "Find them under Catalogue > Categories. Leave subcategory_slug blank when not needed."),
        ("8. Values", "Prices are in rupees and may have up to 2 decimal places. stock, weight_grams and "
         "sort_order must be whole numbers. gender must be men, women or unisex."),
        ("9. Flags and optional values", "Boolean fields accept TRUE/FALSE or Yes/No. Blank is_active defaults "
         "to TRUE; other blank flags default to FALSE. Optional text and compare_at_price_rupees can be left blank."),
        ("10. Limits", "Each product may have up to 30 colors and 12 images total (shared plus color-specific). "
         "The workbook supports up to 300 products and 3,000 data rows; selected images must total 32 MB or less."),
        ("11. Create products", "Bulk upload creates new products only; it does not update existing products. "
         "SKUs and slugs must be unique. Each product is validated independently: valid products are created, "
         "and products with invalid rows or images are skipped and reported. All color rows for one SKU are "
         "treated as a single product."),
        ("Example: one product with two colors", "Enter TWO rows with the same category_slug, name, slug, SKU, "
         "price and all other product details. Row 1: color_name=Black, color_hex=#171717, "
         "common_images=front.jpg, color_images=black-front.jpg;black-back.jpg. Row 2: keep the same SKU and "
         "product details; set color_name=Tan, color_hex=#B87945, common_images blank, "
         "color_images=tan-front.jpg. The upload creates ONE product with TWO colors."),
        ("Example: product without colors", "Use one row, leave color_name/color_hex/color_images blank, "
         "and add any product-wide image filenames under common_images."),
        ("Required columns", "category_slug, name, slug, sku and price_rupees are required. "
         "color_name and color_hex must either both be filled or both be blank."),
        ("Visible columns", "Grid lines and cell borders are enabled in both sheets. If your spreadsheet app hides "
         "them, turn on View > Gridlines."),
    ]
    for label, description in steps:
        instructions.append([label, description])
    instructions.column_dimensions["A"].width = 31
    instructions.column_dimensions["B"].width = 112
    instructions.freeze_panes = "A4"
    instructions.sheet_view.showGridLines = True
    instructions["A1"].font = Font(bold=True, size=16, color="FFFFFF")
    instructions["A1"].fill = PatternFill("solid", fgColor="583D32")
    instructions["A2"].font = Font(italic=True, color="6F6257")
    for row in instructions.iter_rows(min_row=4):
        row[0].font = Font(bold=True, color="583D32")
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            cell.border = Border(
                left=Side(style="thin", color="D9D2CA"),
                right=Side(style="thin", color="D9D2CA"),
                top=Side(style="thin", color="D9D2CA"),
                bottom=Side(style="thin", color="D9D2CA"),
            )
    for row in range(4, instructions.max_row + 1):
        instructions.row_dimensions[row].height = 54

    products = workbook.create_sheet("Products")
    products.append(HEADERS)
    products.freeze_panes = "A2"
    products.auto_filter.ref = f"A1:{get_column_letter(len(HEADERS))}{MAX_ROWS + 1}"
    products.sheet_view.showGridLines = True
    cell_border = Border(
        left=Side(style="thin", color="D9D2CA"),
        right=Side(style="thin", color="D9D2CA"),
        top=Side(style="thin", color="D9D2CA"),
        bottom=Side(style="thin", color="D9D2CA"),
    )
    for cell in products[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="583D32")
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = cell_border
    for row in products.iter_rows(min_row=2, max_row=51, max_col=len(HEADERS)):
        for cell in row:
            cell.border = cell_border
    products.row_dimensions[1].height = 34
    widths = [
        20, 20, 28, 24, 18, 32, 45, 18, 24, 12, 14, 20, 16, 22,
        16, 35, 18, 14, 15, 17, 18, 14, 24, 35, 18, 16, 34, 34,
    ]
    for index, width in enumerate(widths, start=1):
        products.column_dimensions[get_column_letter(index)].width = width
    gender_validation = DataValidation(type="list", formula1='"men,women,unisex"', allow_blank=True)
    boolean_validation = DataValidation(type="list", formula1='"TRUE,FALSE,Yes,No"', allow_blank=True)
    products.add_data_validation(gender_validation)
    gender_validation.add("K2:K3001")
    products.add_data_validation(boolean_validation)
    for column in ("R", "S", "T", "U"):
        boolean_validation.add(f"{column}2:{column}3001")

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _optional_text(value: Any) -> str | None:
    return _text(value) or None


def _required_text(row: dict[str, Any], key: str) -> str:
    value = _text(row.get(key))
    if not value:
        raise ValueError(f"{key} is required")
    return value


def _integer(value: Any, key: str, default: int, maximum: int, minimum: int = 0) -> int:
    if value is None or _text(value) == "":
        return default
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError(f"{key} must be a whole number") from None
    if number != number.to_integral_value() or number < minimum or number > maximum:
        raise ValueError(f"{key} must be a whole number from {minimum} to {maximum}")
    return int(number)


def _price(value: Any, key: str, required: bool) -> int | None:
    if value is None or _text(value) == "":
        if required:
            raise ValueError(f"{key} is required")
        return None
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError(f"{key} must be a valid rupee amount") from None
    if not amount.is_finite() or amount < 0 or amount * 100 != (amount * 100).to_integral_value():
        raise ValueError(f"{key} must be a non-negative amount with at most 2 decimal places")
    return int(amount * 100)


def _boolean(value: Any, key: str, default: bool) -> bool:
    if value is None or _text(value) == "":
        return default
    if isinstance(value, bool):
        return value
    normalized = _text(value).casefold()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    raise ValueError(f"{key} must be TRUE or FALSE")


def _filenames(value: Any, key: str) -> list[str]:
    if value is None or _text(value) == "":
        return []
    names = [_text(part) for part in _text(value).split(";")]
    for name in names:
        if not name or "/" in name or "\\" in name or name in {".", ".."}:
            raise ValueError(f"{key} must contain filenames separated by semicolons, not paths")
    unique: list[str] = []
    seen: set[str] = set()
    for name in names:
        normalized = name.casefold()
        if normalized not in seen:
            unique.append(name)
            seen.add(normalized)
    return unique


def parse_workbook(data: bytes) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    try:
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException, OSError, ParseError, ValueError) as exc:
        raise AppError(
            "Could not read the Excel workbook. Upload a valid .xlsx template.", code="invalid_workbook"
        ) from exc

    if "Products" not in workbook.sheetnames:
        raise AppError("The workbook must contain a Products sheet.", code="invalid_workbook")
    sheet = workbook["Products"]
    if sheet.max_row > MAX_ROWS + 1:
        workbook.close()
        raise AppError(f"The Products sheet can contain at most {MAX_ROWS} data rows.", code="bulk_limit_exceeded")
    header_row = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), ())
    headers = tuple(_text(value) for value in header_row[:len(HEADERS)])
    if headers != HEADERS:
        raise AppError(
            "The Products sheet headers do not match the SPUNI template. Download a fresh template and try again.",
            code="invalid_workbook",
        )

    grouped: OrderedDict[str, dict[str, Any]] = OrderedDict()
    errors: list[dict[str, Any]] = []
    invalid_skus: set[str] = set()
    nonempty_rows = 0
    for row_number, values in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        row = dict(zip(HEADERS, values, strict=False))
        if not any(value is not None and _text(value) for value in values):
            continue
        nonempty_rows += 1
        if nonempty_rows > MAX_ROWS:
            raise AppError(f"The workbook can contain at most {MAX_ROWS} product rows.", code="bulk_limit_exceeded")
        sku = _text(row.get("sku")).upper()
        try:
            sku = _required_text(row, "sku").upper()
            shared: dict[str, Any] = {
                "category_slug": _required_text(row, "category_slug").lower(),
                "subcategory_slug": (_optional_text(row.get("subcategory_slug")) or "").lower() or None,
                "name": _required_text(row, "name"),
                "slug": _required_text(row, "slug").lower(),
                "sku": sku,
                "short_description": _optional_text(row.get("short_description")),
                "description": _optional_text(row.get("description")),
                "price_paise": _price(row.get("price_rupees"), "price_rupees", True),
                "compare_at_price_paise": _price(row.get("compare_at_price_rupees"), "compare_at_price_rupees", False),
                "stock": _integer(row.get("stock"), "stock", 0, 1_000_000),
                "gender": (_optional_text(row.get("gender")) or "unisex").lower(),
                "material": _optional_text(row.get("material")),
                "color": _optional_text(row.get("color")),
                "dimensions": _optional_text(row.get("dimensions")),
                "weight_grams": _integer(row.get("weight_grams"), "weight_grams", 0, 100_000, 1)
                if _optional_text(row.get("weight_grams")) else None,
                "care_instructions": _optional_text(row.get("care_instructions")),
                "badge": _optional_text(row.get("badge")),
                "is_active": _boolean(row.get("is_active"), "is_active", True),
                "is_featured": _boolean(row.get("is_featured"), "is_featured", False),
                "is_bestseller": _boolean(row.get("is_bestseller"), "is_bestseller", False),
                "is_customizable": _boolean(row.get("is_customizable"), "is_customizable", False),
                "sort_order": _integer(row.get("sort_order"), "sort_order", 0, 10_000),
                "meta_title": _optional_text(row.get("meta_title")),
                "meta_description": _optional_text(row.get("meta_description")),
            }
            color_name = _optional_text(row.get("color_name"))
            color_hex = _optional_text(row.get("color_hex"))
            if bool(color_name) != bool(color_hex):
                raise ValueError("color_name and color_hex must both be filled or both be blank")
            common_images = _filenames(row.get("common_images"), "common_images")
            color_images = _filenames(row.get("color_images"), "color_images")
            if color_images and not color_name:
                raise ValueError("color_images can only be used on a row with a color_name")
            existing = grouped.get(sku)
            if existing is None:
                existing = {"shared": shared, "common_images": [], "colors": [], "row": row_number}
                grouped[sku] = existing
            elif existing["shared"] != shared:
                raise ValueError(f"all rows for SKU {sku} must have identical product details in columns A:X")
            prior_common = {name.casefold() for name in existing["common_images"]}
            for name in common_images:
                if name.casefold() not in prior_common:
                    existing["common_images"].append(name)
                    prior_common.add(name.casefold())
            if color_name:
                color_key = color_name.casefold()
                if any(item["name"].casefold() == color_key for item in existing["colors"]):
                    raise ValueError(f"color {color_name} is listed more than once for SKU {sku}")
                existing["colors"].append({"name": color_name, "hex_code": color_hex, "images": color_images})
        except ValueError as exc:
            errors.append({"row": row_number, "sku": sku or None, "message": str(exc)})
            if sku:
                invalid_skus.add(sku)
    workbook.close()

    for sku in invalid_skus:
        grouped.pop(sku, None)
    if not grouped and not errors:
        raise AppError("The Products sheet has no product rows.", code="empty_workbook")
    for sku, product in list(grouped.items()):
        if len(product["colors"]) > 30:
            errors.append({
                "row": product["row"],
                "sku": sku,
                "message": f"SKU {sku} has more than 30 colors.",
            })
            del grouped[sku]
            continue
        image_count = len(product["common_images"]) + sum(len(color["images"]) for color in product["colors"])
        if image_count > 12:
            errors.append({
                "row": product["row"],
                "sku": sku,
                "message": "A product can have at most 12 images total.",
            })
            del grouped[sku]
    if len(grouped) > MAX_PRODUCTS:
        for sku, product in list(grouped.items())[MAX_PRODUCTS:]:
            errors.append({
                "row": product["row"],
                "sku": sku,
                "message": f"The workbook can create at most {MAX_PRODUCTS} products per upload.",
            })
            del grouped[sku]
    return list(grouped.values()), errors
