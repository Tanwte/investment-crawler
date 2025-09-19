// scripts/generate-ssl.js
const fs = require('fs');
const path = require('path');

const sslDir = path.join(__dirname, '..', 'ssl');

// Create ssl directory if it doesn't exist
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir, { recursive: true });
}

const keyPath = path.join(sslDir, 'localhost-key.pem');
const certPath = path.join(sslDir, 'localhost-cert.pem');

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('✅ SSL certificates already exist!');
  console.log('   Key:', keyPath);
  console.log('   Cert:', certPath);
  process.exit(0);
}

console.log('🔐 Generating self-signed SSL certificates for localhost...');

try {
  const selfsigned = require('selfsigned');
  
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'countryName', value: 'SG' },
    { name: 'stateOrProvinceName', value: 'Singapore' },
    { name: 'localityName', value: 'Singapore' },
    { name: 'organizationName', value: 'Trade Intelligence' },
    { name: 'organizationalUnitName', value: 'Development' }
  ];

  const options = {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          {
            type: 2, // DNS
            value: 'localhost'
          },
          {
            type: 7, // IP
            ip: '127.0.0.1'
          }
        ]
      }
    ]
  };

  const pems = selfsigned.generate(attrs, options);
  
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  
  console.log('✅ SSL certificates generated successfully!');
  console.log('   Key:', keyPath);
  console.log('   Cert:', certPath);
  console.log('');
  console.log('⚠️  Note: Since these are self-signed certificates, your browser will show a security warning.');
  console.log('   Click "Advanced" → "Proceed to localhost (unsafe)" to continue.');

} catch (error) {
  console.error('❌ Failed to generate certificates:', error.message);
  process.exit(1);
}