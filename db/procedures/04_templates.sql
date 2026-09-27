-- Ledgerly — Bill template (Smart Invoice / OCR) SPs

CREATE OR REPLACE FUNCTION sp_create_bill_template(
  p_owner_id        UUID,
  p_created_by      UUID,
  p_name            TEXT,
  p_empty_bill_url  TEXT,
  p_sample_bill_url TEXT,
  p_layout_json     JSONB DEFAULT '{}'::jsonb,
  p_field_schema    JSONB DEFAULT '[]'::jsonb,
  p_ocr_raw         JSONB DEFAULT NULL,
  p_set_default     BOOLEAN DEFAULT FALSE
)
RETURNS bill_templates
LANGUAGE plpgsql
AS $$
DECLARE
  v_row bill_templates;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_created_by AND owner_id = p_owner_id AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid user for owner';
  END IF;

  IF p_empty_bill_url IS NULL OR p_sample_bill_url IS NULL THEN
    RAISE EXCEPTION 'both empty_bill_url and sample_bill_url are required';
  END IF;

  IF COALESCE(p_set_default, FALSE) THEN
    UPDATE bill_templates SET is_default = FALSE
    WHERE owner_id = p_owner_id AND is_default = TRUE;
  END IF;

  INSERT INTO bill_templates (
    owner_id, created_by, name, empty_bill_url, sample_bill_url,
    layout_json, field_schema, ocr_raw, is_active, is_default
  )
  VALUES (
    p_owner_id, p_created_by, trim(p_name), p_empty_bill_url, p_sample_bill_url,
    COALESCE(p_layout_json, '{}'::jsonb),
    COALESCE(p_field_schema, '[]'::jsonb),
    p_ocr_raw,
    TRUE,
    COALESCE(p_set_default, FALSE)
  )
  RETURNING * INTO v_row;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id)
  VALUES (p_owner_id, p_created_by, 'template.create', 'bill_templates', v_row.id);

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION sp_update_bill_template(
  p_owner_id     UUID,
  p_template_id  UUID,
  p_user_id      UUID,
  p_name         TEXT DEFAULT NULL,
  p_layout_json  JSONB DEFAULT NULL,
  p_field_schema JSONB DEFAULT NULL,
  p_is_active    BOOLEAN DEFAULT NULL,
  p_set_default  BOOLEAN DEFAULT NULL
)
RETURNS bill_templates
LANGUAGE plpgsql
AS $$
DECLARE
  v_row bill_templates;
BEGIN
  IF COALESCE(p_set_default, FALSE) THEN
    UPDATE bill_templates SET is_default = FALSE
    WHERE owner_id = p_owner_id AND is_default = TRUE AND id <> p_template_id;
  END IF;

  UPDATE bill_templates SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    layout_json = COALESCE(p_layout_json, layout_json),
    field_schema = COALESCE(p_field_schema, field_schema),
    is_active = COALESCE(p_is_active, is_active),
    is_default = CASE WHEN COALESCE(p_set_default, FALSE) THEN TRUE ELSE is_default END
  WHERE id = p_template_id AND owner_id = p_owner_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  INSERT INTO audit_logs (owner_id, user_id, action, entity_type, entity_id)
  VALUES (p_owner_id, p_user_id, 'template.update', 'bill_templates', v_row.id);

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION sp_get_default_bill_template(p_owner_id UUID)
RETURNS SETOF bill_templates
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM bill_templates
  WHERE owner_id = p_owner_id AND is_active = TRUE
  ORDER BY is_default DESC, updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION sp_list_bill_templates(p_owner_id UUID)
RETURNS SETOF bill_templates
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM bill_templates
  WHERE owner_id = p_owner_id
  ORDER BY is_default DESC, updated_at DESC;
$$;
