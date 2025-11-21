require('dotenv').config();
const axios = require('axios');

async function testConnection() {
  // El query exacto de tu imagen
  const jql = 'textfields ~ "PMOD-4187" OR issuekey = "PMOD-4187" ORDER BY created DESC';
  
  console.log('🧪 Probando conexión a Jira...');
  console.log(`   Host: ${process.env.JIRA_HOST}`);
  console.log(`   User: ${process.env.JIRA_USERNAME}`);
  console.log(`   Query: ${jql}`);

  try {
    const res = await axios.post(
      `https://${process.env.JIRA_HOST}/rest/api/3/search/jql`,
      {
        jql: jql,
        maxResults: 5,
        fields: ['summary', 'status']
      },
      {
        auth: {
          username: process.env.JIRA_USERNAME,
          password: process.env.JIRA_PASSWORD
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ ¡Conexión Exitosa!');
    console.log(`   Resultados encontrados: ${res.data.total}`);
    
    if (res.data.issues && res.data.issues.length > 0) {
      console.log('   Tickets encontrados:');
      res.data.issues.forEach(issue => {
        console.log(`   - [${issue.key}] ${issue.fields.summary} (${issue.fields.status.name})`);
      });
    } else {
      console.log('   ⚠️ Conexión OK, pero no se encontró el ticket PMOD-4187 con este usuario/host.');
    }

  } catch (error) {
    console.error('\n❌ Falló la conexión');
    if (error.response) {
      console.error(`   Status: ${error.response.status} ${error.response.statusText}`);
      console.error('   Detalle:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Error:', error.message);
    }
  }
}

testConnection();