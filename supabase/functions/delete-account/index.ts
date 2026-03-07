import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type DeleteAccountResult = {
  deleted_tasks: number;
  deleted_tabs: number;
  deleted_profiles: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authorization header is required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authedClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: deletedData, error: deleteDataError } = await adminClient.rpc(
    'delete_account_data',
    { target_user_id: user.id }
  );

  if (deleteDataError) {
    console.error('[delete-account] delete_account_data failed', deleteDataError);
    return new Response(JSON.stringify({ error: 'Failed to delete account data' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteUserError) {
    console.error('[delete-account] auth.admin.deleteUser failed', deleteUserError);
    return new Response(JSON.stringify({ error: 'Failed to delete auth user' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const result = (deletedData ?? {
    deleted_tasks: 0,
    deleted_tabs: 0,
    deleted_profiles: 0,
  }) as DeleteAccountResult;

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
