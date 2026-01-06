from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import json
import logging

from ...models.audit_log import AuditLog, QuarantinedRecord
from ...models.database import get_db_connection

logger = logging.getLogger(__name__)


class AuditService:
    """Service for managing audit logs and quarantined records"""

    def __init__(self):
        self.db = None

    def log_change(
        self,
        table_name: str,
        record_id: str,
        action: str,
        user_info: Dict[str, Any],
        old_value: Any = None,
        new_value: Any = None,
        field_name: str = None,
        validation_status: str = None,
        validation_errors: List[Dict[str, Any]] = None,
        request_info: Dict[str, Any] = None,
    ) -> int:
        """
        Log a change to the audit trail

        Args:
            table_name: Name of the table that was changed
            record_id: ID of the record that was changed
            action: Type of action (CREATE, UPDATE, DELETE)
            user_info: Information about the user making the change
            old_value: Previous value (for updates)
            new_value: New value
            field_name: Specific field that was changed (optional)
            validation_status: Validation status of the change
            validation_errors: Any validation errors
            request_info: HTTP request information

        Returns:
            ID of the created audit log entry
        """
        try:
            connection = get_db_connection()
            cursor = connection.cursor()

            # Prepare change summary
            change_summary = {
                "action": action,
                "timestamp": datetime.utcnow().isoformat(),
                "validation_status": validation_status,
            }

            if field_name:
                change_summary["field"] = field_name

            if validation_errors:
                change_summary["validation_errors"] = validation_errors

            # Insert audit log entry
            insert_query = """
                INSERT INTO audit_logs (
                    table_name, record_id, action, field_name,
                    old_value, new_value, change_summary,
                    user_id, username, timestamp,
                    session_id, ip_address, user_agent, api_endpoint,
                    validation_status, validation_errors
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """

            cursor.execute(
                insert_query,
                (
                    table_name,
                    record_id,
                    action,
                    field_name,
                    json.dumps(old_value) if old_value is not None else None,
                    json.dumps(new_value) if new_value is not None else None,
                    json.dumps(change_summary),
                    user_info.get("user_id"),
                    user_info.get("username"),
                    datetime.utcnow(),
                    request_info.get("session_id") if request_info else None,
                    request_info.get("ip_address") if request_info else None,
                    request_info.get("user_agent") if request_info else None,
                    request_info.get("api_endpoint") if request_info else None,
                    validation_status,
                    json.dumps(validation_errors) if validation_errors else None,
                ),
            )

            audit_id = cursor.fetchone()[0]
            connection.commit()

            logger.info(f"Logged audit entry {audit_id} for {action} on {table_name}:{record_id}")
            return audit_id

        except Exception as e:
            logger.error(f"Failed to log audit entry: {str(e)}")
            if connection:
                connection.rollback()
            raise
        finally:
            if connection:
                connection.close()

    def quarantine_record(
        self,
        record_id: str,
        table_name: str,
        reason: str,
        validation_errors: List[Dict[str, Any]],
        original_data: Dict[str, Any],
        user_info: Dict[str, Any],
    ) -> int:
        """
        Quarantine a record that failed validation

        Returns:
            ID of the quarantine entry
        """
        try:
            connection = get_db_connection()
            cursor = connection.cursor()

            insert_query = """
                INSERT INTO quarantined_records (
                    original_record_id, table_name, quarantine_reason,
                    validation_errors, quarantined_at, quarantined_by,
                    original_data, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """

            cursor.execute(
                insert_query,
                (
                    record_id,
                    table_name,
                    reason,
                    json.dumps(validation_errors),
                    datetime.utcnow(),
                    user_info.get("user_id"),
                    json.dumps(original_data),
                    "QUARANTINED",
                ),
            )

            quarantine_id = cursor.fetchone()[0]
            connection.commit()

            # Also log the quarantine action
            self.log_change(
                table_name=table_name,
                record_id=record_id,
                action="QUARANTINE",
                user_info=user_info,
                validation_status="QUARANTINED",
                validation_errors=validation_errors,
            )

            logger.warning(f"Quarantined record {record_id} from {table_name}: {reason}")
            return quarantine_id

        except Exception as e:
            logger.error(f"Failed to quarantine record: {str(e)}")
            if connection:
                connection.rollback()
            raise
        finally:
            if connection:
                connection.close()

    def get_audit_trail(
        self, record_id: str = None, table_name: str = None, user_id: str = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get audit trail with optional filters"""
        try:
            connection = get_db_connection()
            cursor = connection.cursor()

            where_conditions = []
            params = []

            if record_id:
                where_conditions.append("record_id = %s")
                params.append(record_id)

            if table_name:
                where_conditions.append("table_name = %s")
                params.append(table_name)

            if user_id:
                where_conditions.append("user_id = %s")
                params.append(user_id)

            where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""

            query = f"""
                SELECT id, table_name, record_id, action, field_name,
                       old_value, new_value, change_summary,
                       user_id, username, timestamp,
                       validation_status, validation_errors
                FROM audit_logs
                {where_clause}
                ORDER BY timestamp DESC
                LIMIT %s
            """

            params.append(limit)
            cursor.execute(query, params)

            columns = [desc[0] for desc in cursor.description]
            results = []

            for row in cursor.fetchall():
                audit_entry = dict(zip(columns, row))
                # Parse JSON fields
                for json_field in ["change_summary", "validation_errors"]:
                    if audit_entry[json_field]:
                        audit_entry[json_field] = json.loads(audit_entry[json_field])
                results.append(audit_entry)

            return results

        except Exception as e:
            logger.error(f"Failed to get audit trail: {str(e)}")
            raise
        finally:
            if connection:
                connection.close()


# Global audit service instance
audit_service = AuditService()
