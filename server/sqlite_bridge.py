import json
import sqlite3
import sys

database_path = sys.argv[1]
request = json.load(sys.stdin)
connection = sqlite3.connect(database_path)
connection.row_factory = sqlite3.Row
connection.execute('PRAGMA foreign_keys = ON')
try:
    action = request.get('action')
    if action == 'exec':
        connection.executescript(request['sql'])
        connection.commit()
        result = None
    elif action == 'batch':
        connection.execute('BEGIN IMMEDIATE')
        for statement in request['statements']:
            connection.execute(statement['sql'], statement.get('params', []))
        connection.commit()
        result = None
    else:
        cursor = connection.execute(request['sql'], request.get('params', []))
        if action == 'all':
            result = [dict(row) for row in cursor.fetchall()]
        elif action == 'get':
            row = cursor.fetchone()
            result = dict(row) if row else None
        else:
            connection.commit()
            result = {'changes': cursor.rowcount, 'lastInsertRowid': cursor.lastrowid}
    print(json.dumps(result))
finally:
    connection.close()
