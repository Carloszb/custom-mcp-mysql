

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import mysql from "mysql2/promise";

// 1. Configurar conexión a BD usando las variables de entorno inyectadas
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 2. Inicializar Servidor MCP
const server = new Server(
  { name: "custom-mysql-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Registrar herramientas 
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_tables",
        description: "Lista todas las tablas disponibles en la base de datos.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "describe_table",
        description: "Obtiene la estructura (columnas y tipos) de una tabla específica.",
        inputSchema: {
          type: "object",
          properties: { table_name: { type: "string" } },
          required: ["table_name"]
        }
      },
      {
        name: "execute_read_query",
        description: "Ejecuta una consulta SQL SELECT. Solo lectura.",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string", description: "La consulta SELECT a ejecutar" } },
          required: ["sql"]
        }
      }
    ]
  };
});

// 4. Implementar ejecución de herramientas (Call Tool)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    if (name === "list_tables") {
      const [rows] = await pool.query("SHOW TABLES");
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
    
    if (name === "describe_table") {
      const { table_name } = args;
      const [rows] = await pool.query(`DESCRIBE ??`, [table_name]);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
    
    if (name === "execute_read_query") {
      const { sql } = args;
      
      // Validación de seguridad para permitir solo consultas SELECT, SHOW o DESCRIBE
      const queryUpper = sql.trim().toUpperCase();
      if (!queryUpper.startsWith("SELECT") && !queryUpper.startsWith("SHOW") && !queryUpper.startsWith("DESCRIBE")) {
        throw new Error("Operación denegada. Solo se permiten consultas de tipo SELECT.");
      }
      
      const [rows] = await pool.query(sql);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
    
    throw new Error(`Herramienta no encontrada: ${name}`);
  } catch (error) {
    return { 
      content: [{ type: "text", text: `Error de base de datos: ${error.message}` }],
      isError: true 
    };
  }
});

// 5. Iniciar el transporte y conectar el servidor MCP
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Custom MySQL MCP Server corriendo en Stdio...");
}

run().catch(console.error);
