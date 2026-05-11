import { createClient } from '@supabase/supabase-js';

// VITE_ environment variables are usually loaded via Vite.
// When running a standalone Node script, use the --env-file flag.
// Usage: node --env-file=.env scripts/migrate_to_s3.js

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.");
  console.log("Please ensure your .env file is present or the variables are passed in, and run the script like:");
  console.log("node --env-file=.env scripts/migrate_to_s3.js");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadBase64ToS3(base64Data, filename) {
  // Extract content type and base64 string
  // Format typically: data:image/png;base64,iVBORw0KGgo...
  const matches = base64Data.match(/^data:([a-zA-Z0-9-+\/]+);base64,(.+)$/);
  
  if (!matches || matches.length !== 3) {
    throw new Error('String is not a valid data URL base64 format.');
  }

  const contentType = matches[1];
  const base64String = matches[2];
  const buffer = Buffer.from(base64String, 'base64');

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
  const s3Path = `public/migrations/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from('workspace-files')
    .upload(s3Path, buffer, {
      contentType: contentType,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('workspace-files')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

async function migrateCards() {
  console.log("Fetching cards with base64 images...");
  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, image')
    .like('image', 'data:%');

  if (error) {
    console.error("Error fetching cards:", error);
    return;
  }

  console.log(`Found ${cards.length} cards to migrate.`);

  for (const card of cards) {
    try {
      console.log(`Migrating card ${card.id}...`);
      const publicUrl = await uploadBase64ToS3(card.image, `card-${card.id}.png`);
      
      const { error: updateError } = await supabase
        .from('cards')
        .update({ image: publicUrl })
        .eq('id', card.id);

      if (updateError) throw updateError;
      console.log(`✅ Successfully migrated card ${card.id}`);
    } catch (err) {
      console.error(`❌ Failed to migrate card ${card.id}:`, err.message);
    }
  }
}

async function migrateFileSystem() {
  console.log("Fetching file_system_nodes with base64 contents...");
  const { data: nodes, error } = await supabase
    .from('file_system_nodes')
    .select('id, content, media_type, name')
    .like('content', 'data:%');

  if (error) {
    console.error("Error fetching file_system_nodes:", error);
    return;
  }

  console.log(`Found ${nodes.length} file system nodes to migrate.`);

  for (const node of nodes) {
    try {
      console.log(`Migrating file node ${node.id}...`);
      const ext = (node.media_type && node.media_type.includes('/')) ? node.media_type.split('/')[1] : 'bin';
      const name = node.name || node.id;
      const publicUrl = await uploadBase64ToS3(node.content, `fs-${name}.${ext}`);
      
      const { error: updateError } = await supabase
        .from('file_system_nodes')
        .update({ content: publicUrl })
        .eq('id', node.id);

      if (updateError) throw updateError;
      console.log(`✅ Successfully migrated file node ${node.id}`);
    } catch (err) {
      console.error(`❌ Failed to migrate file node ${node.id}:`, err.message);
    }
  }
}

async function main() {
  console.log("🚀 Starting Data Migration to Supabase S3");
  await migrateCards();
  await migrateFileSystem();
  console.log("✨ Migration Complete!");
}

main().catch(console.error);
