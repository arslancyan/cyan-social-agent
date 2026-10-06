const securityHeaders=[
 {key:"X-Content-Type-Options",value:"nosniff"},
 {key:"X-Frame-Options",value:"DENY"},
 {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
 {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
 {key:"X-DNS-Prefetch-Control",value:"off"}
];

const nextConfig={
 async headers(){
  return [{source:"/(.*)",headers:securityHeaders.concat(process.env.NODE_ENV==="production"?[{key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"}]:[])}];
 }
};
export default nextConfig;