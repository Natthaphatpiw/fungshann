import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

function cleanEnvValue(value: string | undefined): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function requireEnv(name: string, value: string | undefined): string {
  const cleaned = cleanEnvValue(value);

  if (!cleaned) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return cleaned;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseAdmin;
}

export async function fetchAllRows<T>(
  table: string,
  select: string,
  apply?: (query: any) => any,
  pageSize = 1000
): Promise<T[]> {
  const supabase = getSupabaseAdmin();
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    let query = supabase.from(table).select(select).range(from, to);

    if (apply) {
      query = apply(query);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`[${table}] ${error.message}`);
    }

    const batch = (data || []) as T[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

export function chunkArray<T>(items: T[], chunkSize = 500): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}
