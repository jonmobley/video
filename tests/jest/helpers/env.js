// Upload-endpoint unit tests exercise validation and storage without a
// signed-in session, matching ALLOW_ANONYMOUS_UPLOADS=true deployments.
process.env.ALLOW_ANONYMOUS_UPLOADS = 'true';
