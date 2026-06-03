"""Add google_search_name column to dld_canonical_areas.

DLD's administrative area names don't always match what Google Maps
recognises. "Marsa Dubai" → "Dubai Marina", "Al Barshaa South Fourth"
→ "Jumeirah Village Circle", etc. google_search_name is the
marketing/branded label we feed into Google's name-search URL so
users land on the correct named area instead of the bare admin
sector centroid.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-06-03 19:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b0c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# DLD admin-sector → Google-Maps-friendly search name. Keyed by
# area_name_slug so spelling variants ("Al Barshaa South Third" vs
# "Al Barsha South Third") all resolve cleanly. Source: user-supplied
# alias map, verified against Google Maps results.
ALIASES = {
    "marsa-dubai": "Dubai Marina",
    "al-barsha-south-fourth": "Jumeirah Village Circle",
    "al-barshaa-south-third": "Arjan",
    "al-hebiah-fifth": "Damac Hills 2",
    "madinat-al-mataar": "Dubai South",
    "wadi-al-safa-5": "Arabian Ranches",
    "al-thanyah-fifth": "Jumeirah Lake Towers",
    "al-thanayah-fourth": "Jumeirah Lake Towers",
}


def upgrade() -> None:
    op.add_column(
        "dld_canonical_areas",
        sa.Column("google_search_name", sa.String(255), nullable=True),
    )
    # Backfill the known aliases. Areas without a row in ALIASES leave
    # google_search_name NULL — frontend then falls back to area_name.
    conn = op.get_bind()
    for slug, name in ALIASES.items():
        conn.execute(
            sa.text(
                "UPDATE dld_canonical_areas SET google_search_name = :name "
                "WHERE area_name_slug = :slug"
            ),
            {"name": name, "slug": slug},
        )


def downgrade() -> None:
    op.drop_column("dld_canonical_areas", "google_search_name")
