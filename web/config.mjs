// These are PUBLIC client IDs/URLs, not secrets. Inject real values only after AWS staging deployment.
// Never commit Google client secrets, DB credentials, AWS keys or Cognito client secrets.
export const config = Object.freeze({
  awsRegion: "",
  cognitoDomain: "",
  cognitoClientId: "",
  apiOrigin: "",
  redirectUri: "https://handyos.buitai.com/portal.html",
});
