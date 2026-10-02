// Load the pinned browser SDK only when a user starts an upload.
window.cosmosBlobUpload = async (file, kind, onProgress) => {
  const { upload } = await import('https://esm.sh/@vercel/blob@2.8.0/client?bundle');
  const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'upload';
  return upload(`${kind}/${crypto.randomUUID()}-${safeName}`, file, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    clientPayload: JSON.stringify({ kind }),
    multipart: kind === 'hero-video' || file.size > 100 * 1024 * 1024,
    onUploadProgress: onProgress
  });
};
