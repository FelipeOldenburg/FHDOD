CREATE OR REPLACE FUNCTION hospital_day(timestamp_value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT (timestamp_value::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date::text
$$;

CREATE OR REPLACE FUNCTION preserve_submitted_response() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='submitted' THEN
    RAISE EXCEPTION 'Respostas enviadas são imutáveis';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION preserve_submitted_answer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  response_status TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO response_status FROM responses WHERE id=OLD.response_id FOR UPDATE;
    IF response_status='submitted' THEN
      RAISE EXCEPTION 'Respostas enviadas são imutáveis';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT status INTO response_status FROM responses WHERE id=NEW.response_id FOR UPDATE;
  IF response_status='submitted' THEN
    RAISE EXCEPTION 'Respostas enviadas são imutáveis';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS preserve_submitted_responses ON responses;
CREATE TRIGGER preserve_submitted_responses BEFORE UPDATE OR DELETE ON responses
FOR EACH ROW EXECUTE FUNCTION preserve_submitted_response();

DROP TRIGGER IF EXISTS preserve_submitted_answers ON answers;
CREATE TRIGGER preserve_submitted_answers BEFORE INSERT OR UPDATE OR DELETE ON answers
FOR EACH ROW EXECUTE FUNCTION preserve_submitted_answer();
