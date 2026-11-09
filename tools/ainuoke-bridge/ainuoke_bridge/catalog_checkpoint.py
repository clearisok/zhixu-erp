"""Fixed-query directory prefixes, never credentials or an independent session."""
from datetime import datetime, timezone
import json
from .ainuoke_client import UpstreamSchemaError


def validated_prefix(pages, now=None):
    if not isinstance(pages, list) or len(pages) > 28 or len(json.dumps(pages).encode('utf8')) > 32*1024*1024:
        raise UpstreamSchemaError('catalog_checkpoint_invalid')
    now = now or datetime.now(timezone.utc)
    total = None
    expired = False
    for index, page in enumerate(pages, 1):
        if (not isinstance(page, dict) or set(page) != {'schemaVersion','reportId','page','pageSize','total','rows','queryContext','fetchedAt','snapshotHash'}
                or page['schemaVersion'] != 'ainuoke-direct-read.v2' or page['reportId'] != '6086103'
                or page['queryContext'] != {} or page['pageSize'] != 50 or page['page'] != index
                or type(page['total']) is not int or not 0 <= page['total'] <= 1400
                or not isinstance(page['rows'], list) or len(page['rows']) != min(50,max(0,page['total']-(index-1)*50))
                or index > max(1,(page['total']+49)//50)):
            raise UpstreamSchemaError('catalog_checkpoint_invalid')
        if total is not None and total != page['total']:
            raise UpstreamSchemaError('catalog_checkpoint_invalid')
        total = page['total']
        try:
            fetched = datetime.fromisoformat(page['fetchedAt'].replace('Z','+00:00'))
            age = (now-fetched).total_seconds()
            if age < 0:
                raise ValueError()
            expired = expired or age > 300
        except (ValueError,TypeError,KeyError):
            raise UpstreamSchemaError('catalog_checkpoint_invalid') from None
    return [] if expired else pages


def matches_first_page(prefix, first):
    if not prefix:
        return False
    return all(prefix[0][key] == first[key] for key in ('schemaVersion','reportId','queryContext','page','pageSize','total','rows'))
