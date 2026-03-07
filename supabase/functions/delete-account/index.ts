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
    return new Response(JSON.stringify({
      error: 'Missing Supabase environment',
      code: 'missing_environment',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!authHeader) {
    return new Response(JSON.stringify({
      error: 'Authorization header is required',
      code: 'missing_authorization_header',
    }), {
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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
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

  if (userError) {
    console.error('[delete-account] auth.getUser failed', {
      message: userError.message,
      status: userError.status,
    });
    return new Response(JSON.stringify({
      error: 'Authentication required',
      code: 'auth_user_lookup_failed',
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!user) {
    console.error('[delete-account] auth.getUser returned no user');
    return new Response(JSON.stringify({
      error: 'Authentication required',
      code: 'auth_user_missing',
    }), {
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
    return new Response(JSON.stringify({
      error: 'Failed to delete account data',
      code: 'delete_account_data_failed',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteUserError) {
    console.error('[delete-account] auth.admin.deleteUser failed', deleteUserError);
    return new Response(JSON.stringify({
      error: 'Failed to delete auth user',
      code: 'delete_auth_user_failed',
    }), {
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
