"""Permanent deletion of an account and everything belonging to it.

Required by both the App Store and Google Play: an app with account creation
must offer account deletion from inside the app, not only through a support
email. It is also the only honest answer to "delete my data".

The table list is derived from the model metadata rather than written out by
hand. Every table that stores rows per user has a `user_id` column, so asking
the metadata which tables have one cannot go stale the way a hardcoded list
would -- a new model added next year is covered the day it is defined, without
anyone remembering this file exists. There is a test asserting exactly that.
"""

import logging

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.models import User

log = logging.getLogger(__name__)

USER_ID_COLUMN = "user_id"


def user_owned_tables() -> list:
    """Every table holding rows that belong to one user, children first.

    sorted_tables is dependency-ordered (parents first), so reversing it
    deletes children before parents -- which matters the moment a real foreign
    key is added, and costs nothing until then.
    """
    return [
        table
        for table in reversed(Base.metadata.sorted_tables)
        if USER_ID_COLUMN in table.c and table.name != User.__tablename__
    ]


async def delete_account(db: AsyncSession, user: User) -> dict[str, int]:
    """Erase the account and all of its data. Returns rows removed per table.

    Not a soft delete: there is no `deleted_at` flag to forget to filter on
    later, and a flag would not be a deletion in the sense the stores and the
    user mean it.

    The stored Google/Microsoft OAuth tokens go with their connection rows, so
    this also ends our access to those calendars. It does not revoke the grant
    at the provider -- the user can do that from their Google/Microsoft account
    page, and we should not be making calls on behalf of an account we are in
    the middle of deleting.
    """
    user_id = user.id
    removed: dict[str, int] = {}

    for table in user_owned_tables():
        result = await db.execute(delete(table).where(table.c[USER_ID_COLUMN] == user_id))
        if result.rowcount:
            removed[table.name] = result.rowcount

    await db.delete(user)
    await db.commit()

    # Deliberately logs the row counts and not the email: this line exists to
    # prove a deletion happened, and re-recording the person's address in a log
    # file defeats the point of deleting them.
    log.info("deleted account %s and %d rows across %d tables", user_id, sum(removed.values()), len(removed))
    return removed
