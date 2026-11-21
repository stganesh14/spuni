from io import BytesIO

from openpyxl import Workbook, load_workbook

from app.services.bulk_products import HEADERS, build_template, parse_workbook


def _workbook_bytes(rows: list[dict[str, object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Products"
    sheet.append(HEADERS)
    for row in rows:
        sheet.append([row.get(header) for header in HEADERS])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _product_row(**overrides: object) -> dict[str, object]:
    return {
        "category_slug": "wallets",
        "name": "Classic Wallet",
        "slug": "classic-wallet",
        "sku": "SPN-WL-001",
        "price_rupees": 3999,
        **overrides,
    }


def test_bulk_template_has_instructions_and_products_sheets() -> None:
    workbook = load_workbook(BytesIO(build_template()), data_only=True)
    assert workbook.sheetnames == ["Instructions", "Products"]
    assert tuple(cell.value for cell in workbook["Products"][1]) == HEADERS
    assert workbook["Instructions"]["A4"].value == "1. Prepare products"
    assert "one row for each color" in workbook["Instructions"]["B4"].value
    assert workbook["Instructions"].sheet_view.showGridLines is True
    assert workbook["Products"].sheet_view.showGridLines is True
    workbook.close()


def test_parse_workbook_groups_color_rows_and_deduplicates_shared_images() -> None:
    rows = [
        _product_row(color_name="Black", color_hex="#171717", common_images="front.jpg",
                     color_images="black-front.jpg;black-back.jpg"),
        _product_row(color_name="Tan", color_hex="#B87945", common_images="front.jpg",
                     color_images="tan-front.jpg"),
    ]

    products, errors = parse_workbook(_workbook_bytes(rows))
    [product] = products

    assert errors == []
    assert product["shared"]["price_paise"] == 399900
    assert product["common_images"] == ["front.jpg"]
    assert [color["name"] for color in product["colors"]] == ["Black", "Tan"]
    assert product["colors"][0]["images"] == ["black-front.jpg", "black-back.jpg"]


def test_parse_workbook_accepts_a_product_without_colors() -> None:
    products, errors = parse_workbook(_workbook_bytes([_product_row(common_images="shared.jpg")]))
    [product] = products

    assert errors == []
    assert product["colors"] == []
    assert product["common_images"] == ["shared.jpg"]
    assert product["shared"]["is_active"] is True
    assert product["shared"]["is_featured"] is False


def test_parse_workbook_keeps_valid_products_when_another_product_has_bad_rows() -> None:
    rows = [
        _product_row(color_name="Black", color_hex="#171717"),
        _product_row(color_name="Tan", color_hex="#B87945", stock=4),
        _product_row(name="Travel Wallet", slug="travel-wallet", sku="SPN-WL-002"),
    ]

    products, errors = parse_workbook(_workbook_bytes(rows))

    assert [product["shared"]["sku"] for product in products] == ["SPN-WL-002"]
    assert errors == [{
        "row": 3,
        "sku": "SPN-WL-001",
        "message": "all rows for SKU SPN-WL-001 must have identical product details in columns A:X",
    }]
