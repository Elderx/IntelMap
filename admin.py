#!/usr/bin/env python3
import os
import sys
import argparse
import secrets
import string

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Missing dependency: psycopg2-binary. Install with: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(1)

try:
    import bcrypt
except ImportError:
    print("Missing dependency: bcrypt. Install with: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(1)

ALPHANUM = string.ascii_letters + string.digits

def gen_password(length: int = 32) -> str:
    return ''.join(secrets.choice(ALPHANUM) for _ in range(length))

def connect(db_host, db_port, db_name, db_user, db_pass):
    return psycopg2.connect(
        host=db_host,
        port=db_port,
        dbname=db_name,
        user=db_user,
        password=db_pass,
        cursor_factory=RealDictCursor,
    )

def ensure_users_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        """)
        conn.commit()

def user_exists(conn, username: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE username = %s LIMIT 1", (username,))
        return cur.fetchone() is not None

def create_user(conn, username: str, password: str, rounds: int = 10):
    salt = bcrypt.gensalt(rounds)
    pw_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    with conn.cursor() as cur:
        cur.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id", (username, pw_hash))
        user_id = cur.fetchone()["id"]
        conn.commit()
        return user_id

def main():
    parser = argparse.ArgumentParser(description="Create a new user for mml-map server")
    parser.add_argument("username", help="Username to create")
    parser.add_argument("--length", type=int, default=32, help="Password length (default 32)")
    parser.add_argument("--db-host", default=os.getenv("DB_HOST", "localhost"))
    parser.add_argument("--db-port", default=int(os.getenv("DB_PORT", "5432")))
    parser.add_argument("--db-name", default=os.getenv("DB_NAME", "mmlmap"))
    parser.add_argument("--db-user", default=os.getenv("DB_USER", "postgres"))
    parser.add_argument("--db-pass", default=os.getenv("DB_PASSWORD", "postgres"))
    args = parser.parse_args()

    password = gen_password(args.length)

    try:
        conn = connect(args.db_host, args.db_port, args.db_name, args.db_user, args.db_pass)
    except Exception as e:
        print(f"Failed to connect to database: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        ensure_users_table(conn)
        if user_exists(conn, args.username):
            print(f"Error: user '{args.username}' already exists", file=sys.stderr)
            sys.exit(2)
        user_id = create_user(conn, args.username, password)
    finally:
        conn.close()

    print("User created successfully")
    print(f"Username: {args.username}")
    print(f"Password: {password}")

if __name__ == "__main__":
    main()
