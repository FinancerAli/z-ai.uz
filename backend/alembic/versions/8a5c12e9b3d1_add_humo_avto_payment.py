"""add HUMO Avto payment tables (humo_orders, sms_logs, app_settings)

Revision ID: 8a5c12e9b3d1
Revises: 6a81ce51de0f
Create Date: 2026-05-19 12:00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8a5c12e9b3d1"
down_revision = "6a81ce51de0f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── humo_orders ─────────────────────────────────────────────
    op.create_table(
        "humo_orders",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("user_agent_id", sa.String(length=36), sa.ForeignKey("user_agents.id"), nullable=True),
        sa.Column("agent_id", sa.String(length=36), sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("plan", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column("base_amount", sa.Float, nullable=False),
        sa.Column("expected_amount", sa.Float, nullable=False),
        sa.Column("extra_sum", sa.Float, nullable=False, server_default="0"),
        sa.Column("card_mask", sa.String(length=50), nullable=False),
        sa.Column("card_holder_name", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("sms_log_id", sa.String(length=36), nullable=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("paid_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_humo_orders_user_id", "humo_orders", ["user_id"])
    op.create_index("ix_humo_orders_user_agent_id", "humo_orders", ["user_agent_id"])
    op.create_index("ix_humo_orders_expected_amount", "humo_orders", ["expected_amount"])
    op.create_index("ix_humo_orders_status", "humo_orders", ["status"])
    op.create_index("ix_humo_orders_expires_at", "humo_orders", ["expires_at"])

    # ─── sms_logs ───────────────────────────────────────────────
    op.create_table(
        "sms_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("sms_external_id", sa.String(length=100), nullable=False, unique=True),
        sa.Column("from_chat", sa.String(length=100), nullable=False),
        sa.Column("raw_text", sa.Text, nullable=False),
        sa.Column("received_at", sa.DateTime, nullable=False),
        sa.Column("transaction_type", sa.String(length=20), nullable=True),
        sa.Column("parsed_amount", sa.Float, nullable=True),
        sa.Column("parsed_card", sa.String(length=50), nullable=True),
        sa.Column("parsed_source", sa.String(length=255), nullable=True),
        sa.Column("parsed_balance", sa.Float, nullable=True),
        sa.Column("parsed_at", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="received"),
        sa.Column("matched_order_id", sa.String(length=36), sa.ForeignKey("humo_orders.id"), nullable=True),
        sa.Column("matched_by", sa.String(length=36), nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sms_logs_sms_external_id", "sms_logs", ["sms_external_id"], unique=True)
    op.create_index("ix_sms_logs_received_at", "sms_logs", ["received_at"])
    op.create_index("ix_sms_logs_parsed_amount", "sms_logs", ["parsed_amount"])
    op.create_index("ix_sms_logs_parsed_card", "sms_logs", ["parsed_card"])
    op.create_index("ix_sms_logs_status", "sms_logs", ["status"])

    # ─── app_settings ───────────────────────────────────────────
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_index("ix_sms_logs_status", table_name="sms_logs")
    op.drop_index("ix_sms_logs_parsed_card", table_name="sms_logs")
    op.drop_index("ix_sms_logs_parsed_amount", table_name="sms_logs")
    op.drop_index("ix_sms_logs_received_at", table_name="sms_logs")
    op.drop_index("ix_sms_logs_sms_external_id", table_name="sms_logs")
    op.drop_table("sms_logs")
    op.drop_index("ix_humo_orders_expires_at", table_name="humo_orders")
    op.drop_index("ix_humo_orders_status", table_name="humo_orders")
    op.drop_index("ix_humo_orders_expected_amount", table_name="humo_orders")
    op.drop_index("ix_humo_orders_user_agent_id", table_name="humo_orders")
    op.drop_index("ix_humo_orders_user_id", table_name="humo_orders")
    op.drop_table("humo_orders")
