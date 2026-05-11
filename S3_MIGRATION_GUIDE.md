# S3 Storage Migration Guide

Currently, your application converts files into Base64 strings and saves them directly inside your PostgreSQL database (`cards` and `file_system_nodes` tables). As your application grows, these massive text strings will slow down your database queries and bloat your database size.

Because you are already using Supabase, the best "S3 Storage" approach is to use **Supabase Storage**, which is an S3-backed storage system that integrates natively with your existing `supabase-js` client and user authentication.

Here are the manual steps you would take to complete this migration.

## Step 1: Create the Storage Bucket
Instead of storing the file inside the row, we need a dedicated bucket to hold files.
1. Go to your Supabase Dashboard.
2. Navigate to **Storage** > **New Bucket**.
3. Name it `workspace-files`.
4. Decide on Security: 
   - **Public**: Easier. Anyone with the URL can view the file.
   - **Private**: More secure. You will need to write Row Level Security (RLS) policies so only users who own the session can view its files.

## Step 2: Refactor Application Upload Logic
Currently, your app converts files directly into base64 via `FileReader`. We need to intercept this and upload it to the bucket instead.

1. **Modify `Workspace.tsx`**: Locate functions like `handleUploadDoc` and `handleUploadImage`. 
2. Instead of `reader.readAsDataURL(file)`, you will pass the raw `File` object to Supabase:
```javascript
// Upload the file to S3/Supabase Storage
const fileName = `public/${Date.now()}-${file.name}`;
const { data, error } = await supabase.storage
  .from('workspace-files')
  .upload(fileName, file);

// Get the URL to save to your database
const { data: urlData } = supabase.storage
  .from('workspace-files')
  .getPublicUrl(fileName);

// Assign this URL to the Card or FileSystemItem instead of base64
handleAddCard(x, y, {
  image: urlData.publicUrl, 
  // ...
});
```

## Step 3: Handle Secure Loading (If Using Private Bucket)
If you made your bucket private, the direct URL will give an Access Denied error.
1. When loading your session inside `use-workspace.ts`, you would need to iterate through your cards and files.
2. For any file containing a bucket path, you would request a short-lived temporary URL:
```javascript
const { data, error } = await supabase.storage
  .from('workspace-files')
  .createSignedUrl('path/to/file.pdf', 3600); // good for 1 hour

card.image = data.signedUrl;
```

## Step 4: Write a Data Migration Script
You have an existing database filled with Base64 strings! You can't just flip the switch, otherwise old files will break. You need to write a one-time migration script (likely in a `Node.js` file run from your terminal).

**The script must:**
1. Fetch all rows from your `cards` and `file_system_nodes` tables where `image` or `content` starts with `data:`.
2. Loop through each row.
3. Convert the base64 string back into a Binary Buffer.
4. Upload that Buffer to your new `workspace-files` storage bucket.
5. Take the URL from the bucket upload and `UPDATE` the database row, replacing the base64 text with the lean S3 URL.

## Step 5: Clean Up and Optimize
1. Remove all the heavy Base64 conversion code across your system (it will no longer be needed).
2. For PDF files, keep the `usePdfBlobUrl` hook (or convert it) because even if the PDF is hosted on S3, you might still need to fetch it as a Blob to bypass strict Chromium iframe rules, OR simply fetching the `URL` natively will work if the Content-Type header on the bucket is perfectly set to `application/pdf`.
