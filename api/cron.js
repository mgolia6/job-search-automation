export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  console.log('=== CRON FUNCTION TRIGGERED ===');
  console.log('Headers:', req.headers);
  console.log('Environment check:', {
    hasCronSecret: !!process.env.CRON_SECRET,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_KEY
  });
  
  // Verify auth
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  
  console.log('Auth check:', {
    receivedAuth: authHeader ? 'present' : 'missing',
    expectedAuth: expectedAuth ? 'present' : 'missing',
    matches: authHeader === expectedAuth
  });
  
  if (authHeader !== expectedAuth) {
    console.log('AUTH FAILED');
    return res.status(401).json({ 
      error: 'Unauthorized',
      timestamp: new Date().toISOString()
    });
  }
  
  console.log('AUTH SUCCESS - Hello from job scraper!');
  
  res.status(200).json({
    success: true,
    message: 'Hello from job scraper! All systems operational.',
    timestamp: new Date().toISOString(),
    env_check: {
      hasCronSecret: !!process.env.CRON_SECRET,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_KEY
    }
  });
}
