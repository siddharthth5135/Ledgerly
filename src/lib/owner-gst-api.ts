/**
 * Per-owner (per business) GST API credentials — multi-tenant.
 * End users enter details in Settings; we never ask them to edit server .env.
 */
import { queryOne } from "@/lib/db";
import { hasEncryptionKey, maskSecret, openSecret, sealSecret } from "@/lib/secret-box";

export type GstApiEnv = "sandbox" | "production";
export type GstApiProvider = "nic_direct" | "gsp";

export type OwnerGstApiPublic = {
  provider: GstApiProvider;
  gspName: string | null;
  apiEnv: GstApiEnv;
  gstin: string | null;
  einvEnabled: boolean;
  einvUsernameMasked: string | null;
  einvHasPassword: boolean;
  einvHasClientId: boolean;
  einvHasClientSecret: boolean;
  einvConnectedAt: string | null;
  einvLastOkAt: string | null;
  einvLastError: string | null;
  ewbEnabled: boolean;
  ewbUsernameMasked: string | null;
  ewbHasPassword: boolean;
  ewbHasClientId: boolean;
  ewbHasClientSecret: boolean;
  ewbConnectedAt: string | null;
  ewbLastOkAt: string | null;
  ewbLastError: string | null;
  setupStep: string;
  notes: string | null;
  encryptionReady: boolean;
  einvReady: boolean;
  ewbReady: boolean;
};

export type OwnerGstApiSecrets = {
  provider: GstApiProvider;
  gspName: string | null;
  apiEnv: GstApiEnv;
  gstin: string;
  einv: {
    enabled: boolean;
    username: string;
    password: string;
    clientId: string;
    clientSecret: string;
  };
  ewb: {
    enabled: boolean;
    username: string;
    password: string;
    clientId: string;
    clientSecret: string;
  };
};

type Row = {
  provider: string;
  gsp_name: string | null;
  api_env: string;
  gstin: string | null;
  einv_enabled: boolean;
  einv_username_enc: string | null;
  einv_password_enc: string | null;
  einv_client_id_enc: string | null;
  einv_client_secret_enc: string | null;
  einv_connected_at: string | null;
  einv_last_ok_at: string | null;
  einv_last_error: string | null;
  ewb_enabled: boolean;
  ewb_username_enc: string | null;
  ewb_password_enc: string | null;
  ewb_client_id_enc: string | null;
  ewb_client_secret_enc: string | null;
  ewb_connected_at: string | null;
  ewb_last_ok_at: string | null;
  ewb_last_error: string | null;
  setup_step: string;
  notes: string | null;
};

function emptyPublic(): OwnerGstApiPublic {
  return {
    provider: "nic_direct",
    gspName: null,
    apiEnv: "sandbox",
    gstin: null,
    einvEnabled: false,
    einvUsernameMasked: null,
    einvHasPassword: false,
    einvHasClientId: false,
    einvHasClientSecret: false,
    einvConnectedAt: null,
    einvLastOkAt: null,
    einvLastError: null,
    ewbEnabled: false,
    ewbUsernameMasked: null,
    ewbHasPassword: false,
    ewbHasClientId: false,
    ewbHasClientSecret: false,
    ewbConnectedAt: null,
    ewbLastOkAt: null,
    ewbLastError: null,
    setupStep: "not_started",
    notes: null,
    encryptionReady: hasEncryptionKey(),
    einvReady: false,
    ewbReady: false,
  };
}

function toPublic(row: Row | null): OwnerGstApiPublic {
  if (!row) return emptyPublic();
  const einvUser = openSecret(row.einv_username_enc);
  const ewbUser = openSecret(row.ewb_username_enc);
  const einvReady =
    row.einv_enabled &&
    !!openSecret(row.einv_username_enc) &&
    !!openSecret(row.einv_password_enc) &&
    !!openSecret(row.einv_client_id_enc) &&
    !!openSecret(row.einv_client_secret_enc) &&
    !!row.gstin;
  const ewbReady =
    row.ewb_enabled &&
    !!openSecret(row.ewb_username_enc) &&
    !!openSecret(row.ewb_password_enc) &&
    !!(openSecret(row.ewb_client_id_enc) || openSecret(row.einv_client_id_enc)) &&
    !!(openSecret(row.ewb_client_secret_enc) || openSecret(row.einv_client_secret_enc)) &&
    !!row.gstin;
  return {
    provider: (row.provider as GstApiProvider) || "nic_direct",
    gspName: row.gsp_name,
    apiEnv: (row.api_env as GstApiEnv) || "sandbox",
    gstin: row.gstin,
    einvEnabled: row.einv_enabled,
    einvUsernameMasked: maskSecret(einvUser),
    einvHasPassword: !!row.einv_password_enc,
    einvHasClientId: !!row.einv_client_id_enc,
    einvHasClientSecret: !!row.einv_client_secret_enc,
    einvConnectedAt: row.einv_connected_at,
    einvLastOkAt: row.einv_last_ok_at,
    einvLastError: row.einv_last_error,
    ewbEnabled: row.ewb_enabled,
    ewbUsernameMasked: maskSecret(ewbUser),
    ewbHasPassword: !!row.ewb_password_enc,
    ewbHasClientId: !!row.ewb_client_id_enc,
    ewbHasClientSecret: !!row.ewb_client_secret_enc,
    ewbConnectedAt: row.ewb_connected_at,
    ewbLastOkAt: row.ewb_last_ok_at,
    ewbLastError: row.ewb_last_error,
    setupStep: row.setup_step,
    notes: row.notes,
    encryptionReady: hasEncryptionKey(),
    einvReady,
    ewbReady,
  };
}

export async function getOwnerGstApiPublic(ownerId: string): Promise<OwnerGstApiPublic> {
  const row = await queryOne<Row>(`SELECT * FROM owner_gst_api WHERE owner_id = $1`, [ownerId]);
  return toPublic(row);
}

export async function getOwnerGstApiSecrets(ownerId: string): Promise<OwnerGstApiSecrets | null> {
  const row = await queryOne<Row>(`SELECT * FROM owner_gst_api WHERE owner_id = $1`, [ownerId]);
  if (!row?.gstin) return null;
  const einvUser = openSecret(row.einv_username_enc) || "";
  const einvPass = openSecret(row.einv_password_enc) || "";
  const einvCid = openSecret(row.einv_client_id_enc) || "";
  const einvCsec = openSecret(row.einv_client_secret_enc) || "";
  const ewbUser = openSecret(row.ewb_username_enc) || einvUser;
  const ewbPass = openSecret(row.ewb_password_enc) || einvPass;
  const ewbCid = openSecret(row.ewb_client_id_enc) || einvCid;
  const ewbCsec = openSecret(row.ewb_client_secret_enc) || einvCsec;
  return {
    provider: (row.provider as GstApiProvider) || "nic_direct",
    gspName: row.gsp_name,
    apiEnv: (row.api_env as GstApiEnv) || "sandbox",
    gstin: row.gstin,
    einv: {
      enabled: row.einv_enabled,
      username: einvUser,
      password: einvPass,
      clientId: einvCid,
      clientSecret: einvCsec,
    },
    ewb: {
      enabled: row.ewb_enabled,
      username: ewbUser,
      password: ewbPass,
      clientId: ewbCid,
      clientSecret: ewbCsec,
    },
  };
}

export type SaveOwnerGstApiInput = {
  provider?: GstApiProvider;
  gspName?: string | null;
  apiEnv?: GstApiEnv;
  gstin?: string | null;
  einvEnabled?: boolean;
  einvUsername?: string | null;
  /** omit / empty = keep existing */
  einvPassword?: string | null;
  einvClientId?: string | null;
  einvClientSecret?: string | null;
  ewbEnabled?: boolean;
  ewbUsername?: string | null;
  ewbPassword?: string | null;
  ewbClientId?: string | null;
  ewbClientSecret?: string | null;
  notes?: string | null;
  /** if true, blank password fields clear stored secrets */
  clearEmptySecrets?: boolean;
};

async function existingEnc(ownerId: string) {
  return queryOne<Row>(`SELECT * FROM owner_gst_api WHERE owner_id = $1`, [ownerId]);
}

function pickEnc(
  next: string | null | undefined,
  prevEnc: string | null | undefined,
  clearEmpty: boolean
) {
  if (next === undefined) return prevEnc ?? null;
  if (next === null || next === "") return clearEmpty ? null : prevEnc ?? null;
  return sealSecret(next);
}

export async function saveOwnerGstApi(ownerId: string, input: SaveOwnerGstApiInput) {
  const prev = await existingEnc(ownerId);
  const clearEmpty = !!input.clearEmptySecrets;

  const gstin = (input.gstin !== undefined ? input.gstin : prev?.gstin || null)
    ?.toUpperCase()
    .replace(/\s+/g, "") || null;

  const row = await queryOne<Row>(
    `INSERT INTO owner_gst_api (
       owner_id, provider, gsp_name, api_env, gstin,
       einv_enabled, einv_username_enc, einv_password_enc, einv_client_id_enc, einv_client_secret_enc,
       ewb_enabled, ewb_username_enc, ewb_password_enc, ewb_client_id_enc, ewb_client_secret_enc,
       setup_step, notes, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,$10,
       $11,$12,$13,$14,$15,
       $16,$17, NOW()
     )
     ON CONFLICT (owner_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       gsp_name = EXCLUDED.gsp_name,
       api_env = EXCLUDED.api_env,
       gstin = EXCLUDED.gstin,
       einv_enabled = EXCLUDED.einv_enabled,
       einv_username_enc = EXCLUDED.einv_username_enc,
       einv_password_enc = EXCLUDED.einv_password_enc,
       einv_client_id_enc = EXCLUDED.einv_client_id_enc,
       einv_client_secret_enc = EXCLUDED.einv_client_secret_enc,
       ewb_enabled = EXCLUDED.ewb_enabled,
       ewb_username_enc = EXCLUDED.ewb_username_enc,
       ewb_password_enc = EXCLUDED.ewb_password_enc,
       ewb_client_id_enc = EXCLUDED.ewb_client_id_enc,
       ewb_client_secret_enc = EXCLUDED.ewb_client_secret_enc,
       setup_step = EXCLUDED.setup_step,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [
      ownerId,
      input.provider || prev?.provider || "nic_direct",
      input.gspName !== undefined ? input.gspName : prev?.gsp_name || null,
      input.apiEnv || prev?.api_env || "sandbox",
      gstin,
      input.einvEnabled ?? prev?.einv_enabled ?? false,
      pickEnc(input.einvUsername, prev?.einv_username_enc, clearEmpty),
      pickEnc(input.einvPassword, prev?.einv_password_enc, clearEmpty),
      pickEnc(input.einvClientId, prev?.einv_client_id_enc, clearEmpty),
      pickEnc(input.einvClientSecret, prev?.einv_client_secret_enc, clearEmpty),
      input.ewbEnabled ?? prev?.ewb_enabled ?? false,
      pickEnc(input.ewbUsername, prev?.ewb_username_enc, clearEmpty),
      pickEnc(input.ewbPassword, prev?.ewb_password_enc, clearEmpty),
      pickEnc(input.ewbClientId, prev?.ewb_client_id_enc, clearEmpty),
      pickEnc(input.ewbClientSecret, prev?.ewb_client_secret_enc, clearEmpty),
      "details_saved",
      input.notes !== undefined ? input.notes : prev?.notes || null,
    ]
  );

  return toPublic(row);
}

export async function markGstApiTest(
  ownerId: string,
  kind: "einv" | "ewb",
  ok: boolean,
  error?: string
) {
  if (kind === "einv") {
    await queryOne(
      `UPDATE owner_gst_api SET
         einv_last_ok_at = CASE WHEN $2 THEN NOW() ELSE einv_last_ok_at END,
         einv_connected_at = CASE WHEN $2 THEN COALESCE(einv_connected_at, NOW()) ELSE einv_connected_at END,
         einv_last_error = $3,
         setup_step = CASE WHEN $2 AND setup_step IN ('not_started','details_saved') THEN 'einv_tested'
                           WHEN $2 AND setup_step = 'ewb_tested' THEN 'live'
                           ELSE setup_step END,
         updated_at = NOW()
       WHERE owner_id = $1`,
      [ownerId, ok, ok ? null : (error || "Test failed").slice(0, 500)]
    );
  } else {
    await queryOne(
      `UPDATE owner_gst_api SET
         ewb_last_ok_at = CASE WHEN $2 THEN NOW() ELSE ewb_last_ok_at END,
         ewb_connected_at = CASE WHEN $2 THEN COALESCE(ewb_connected_at, NOW()) ELSE ewb_connected_at END,
         ewb_last_error = $3,
         setup_step = CASE WHEN $2 AND setup_step IN ('not_started','details_saved','einv_tested') THEN
                              CASE WHEN setup_step = 'einv_tested' THEN 'live' ELSE 'ewb_tested' END
                           ELSE setup_step END,
         updated_at = NOW()
       WHERE owner_id = $1`,
      [ownerId, ok, ok ? null : (error || "Test failed").slice(0, 500)]
    );
  }
  return getOwnerGstApiPublic(ownerId);
}
