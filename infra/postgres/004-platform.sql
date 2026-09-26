-- Phase two migration. Reapplied before runtime privileges on each deployment.
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE identity.users ADD CONSTRAINT users_role_check CHECK(role IN ('ADMIN','TRAVEL_MANAGER','TRAVELER','VIEWER'));
ALTER TABLE travel.travels ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES identity.users ON DELETE SET NULL;
ALTER TABLE travel.travels ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'USD';
CREATE INDEX IF NOT EXISTS travels_manager ON travel.travels(manager_id);
CREATE OR REPLACE VIEW identity.public_profiles AS SELECT id,name,role FROM identity.users WHERE status='ACTIVE';
GRANT SELECT ON identity.public_profiles TO travel,payments;
CREATE TABLE IF NOT EXISTS payments.bookings (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES identity.users ON DELETE RESTRICT,
 travel_id uuid NOT NULL REFERENCES travel.travels ON DELETE RESTRICT,
 provider text NOT NULL CHECK(provider IN ('STRIPE','PAYPAL')), amount numeric(12,2) NOT NULL CHECK(amount>0),
 currency char(3) NOT NULL, status text NOT NULL CHECK(status IN ('PENDING','CONFIRMED','CANCEL_REQUESTED','CANCELLED','REFUNDED')),
 provider_id text UNIQUE, capture_id text, checkout_url text, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_active ON payments.bookings(user_id,travel_id) WHERE status IN ('PENDING','CONFIRMED','CANCEL_REQUESTED');
CREATE INDEX IF NOT EXISTS booking_travel ON payments.bookings(travel_id,status);
ALTER TABLE payments.bookings ADD COLUMN IF NOT EXISTS refund_id text;
ALTER TABLE payments.bookings ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE travel.travels ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS travel.feedback (
 id uuid PRIMARY KEY, travel_id uuid NOT NULL REFERENCES travel.travels ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity.users ON DELETE CASCADE,
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), comment varchar(2000) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(travel_id,user_id)
);
CREATE TABLE IF NOT EXISTS travel.reports (
 id uuid PRIMARY KEY, reporter_id uuid REFERENCES identity.users ON DELETE SET NULL,
 target_user_id uuid REFERENCES identity.users ON DELETE SET NULL,
 travel_id uuid REFERENCES travel.travels ON DELETE SET NULL,
 reason varchar(2000) NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','REVIEWED','DISMISSED')),
 resolution varchar(2000), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
ALTER TABLE travel.feedback ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS travel.search_outbox (id bigserial PRIMARY KEY,travel_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION travel.enqueue_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
 IF TG_TABLE_NAME='travels' THEN tid=COALESCE(NEW.id,OLD.id); ELSE tid=COALESCE(NEW.travel_id,OLD.travel_id); END IF;
 INSERT INTO travel.graph_outbox(travel_id) VALUES(tid);
 INSERT INTO travel.search_outbox(travel_id) VALUES(tid);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS platform_travel_event ON travel.travels;
CREATE TRIGGER platform_travel_event AFTER INSERT OR UPDATE OR DELETE ON travel.travels FOR EACH ROW EXECUTE FUNCTION travel.enqueue_projection();
DROP TRIGGER IF EXISTS platform_feedback_event ON travel.feedback;
CREATE TRIGGER platform_feedback_event AFTER INSERT OR UPDATE OR DELETE ON travel.feedback FOR EACH ROW EXECUTE FUNCTION travel.enqueue_projection();
DROP TRIGGER IF EXISTS platform_booking_event ON payments.bookings;
CREATE TRIGGER platform_booking_event AFTER INSERT OR UPDATE OR DELETE ON payments.bookings FOR EACH ROW EXECUTE FUNCTION travel.enqueue_projection();
GRANT SELECT ON payments.bookings TO travel;
GRANT SELECT ON travel.travels,travel.stops TO payments;
GRANT SELECT,INSERT,DELETE ON travel.participants TO payments;
GRANT INSERT ON travel.graph_outbox,travel.search_outbox TO payments;
GRANT USAGE,SELECT ON SEQUENCE travel.graph_outbox_id_seq,travel.search_outbox_id_seq TO payments;
-- PostgreSQL requires UPDATE privilege to acquire a row lock. Only the ID column
-- is writable by payments; it is never changed by application code.
GRANT UPDATE(id) ON travel.travels TO payments;

-- Enforce booking invariants for both legacy admin endpoints and manager APIs.
CREATE OR REPLACE FUNCTION travel.guard_booked_trip() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserved integer;
BEGIN
 SELECT count(*) INTO reserved FROM payments.bookings WHERE travel_id=OLD.id AND status IN ('PENDING','CONFIRMED','CANCEL_REQUESTED');
 IF reserved>0 AND (NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date OR NEW.status<>'PUBLISHED' OR NEW.capacity<reserved OR NEW.manager_id IS DISTINCT FROM OLD.manager_id) THEN
  RAISE EXCEPTION 'Existing bookings protect dates, ownership, publication and capacity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_booked_trip ON travel.travels;
CREATE TRIGGER protect_booked_trip BEFORE UPDATE ON travel.travels FOR EACH ROW EXECUTE FUNCTION travel.guard_booked_trip();

INSERT INTO travel.search_outbox(travel_id) SELECT id FROM travel.travels WHERE NOT EXISTS (SELECT 1 FROM travel.search_outbox);
