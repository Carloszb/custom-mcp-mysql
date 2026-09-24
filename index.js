

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import mysql from "mysql2/promise";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";

// 1. Determinar el entorno de trabajo y forzar nombres estrictos
const allowedEnvs = ['development', 'preprod', 'prod'];
export const APP_ENV = (process.env.APP_ENV || 'development').toLowerCase();

if (!allowedEnvs.includes(APP_ENV)) {
  console.error(`[ERROR] APP_ENV='${APP_ENV}' no es válido. Usa: development, preprod o prod`);
  process.exit(1);
}

let envPrefix = 'DEV_';
if (APP_ENV === 'prod') envPrefix = 'PROD_';
if (APP_ENV === 'preprod') envPrefix = 'PREPROD_';

// Función helper para leer variable del entorno específico, o caer en la genérica
const getEnv = (key) => process.env[`${envPrefix}${key}`] || process.env[key];

// 2. Configurar conexión a BD usando las variables de entorno según el entorno actual
const pool = mysql.createPool({
  host: getEnv('MYSQL_HOST'),
  port: getEnv('MYSQL_PORT') ? parseInt(getEnv('MYSQL_PORT')) : 3306,
  user: getEnv('MYSQL_USER'),
  password: getEnv('MYSQL_PASS'),
  database: getEnv('MYSQL_DB'),
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
      },
      {
        name: "get_foreign_keys",
        description: "Obtiene las relaciones (llaves foráneas) de una tabla para saber cómo se conecta con otras.",
        inputSchema: {
          type: "object",
          properties: { table_name: { type: "string", description: "Nombre de la tabla a consultar" } },
          required: ["table_name"]
        }
      },
      {
        name: "read_workbench_model",
        description: "Lee un modelo .mwb (MySQL Workbench) por su nombre desde el directorio configurado en MODELS_DIR, extrayendo su XML a JSON.",
        inputSchema: {
          type: "object",
          properties: { model_name: { type: "string", description: "Nombre del modelo (con o sin la extensión .mwb)" } },
          required: ["model_name"]
        }
      },
      {
        name: "insert_record",
        description: "Inserta un nuevo registro en una tabla de forma segura.",
        inputSchema: {
          type: "object",
          properties: { 
            table: { type: "string" },
            data: { type: "object", description: "Pares columna:valor a insertar" }
          },
          required: ["table", "data"]
        }
      },
      {
        name: "update_record",
        description: "Actualiza registros existentes en una tabla.",
        inputSchema: {
          type: "object",
          properties: { 
            table: { type: "string" },
            data: { type: "object", description: "Pares columna:valor a actualizar" },
            where: { type: "object", description: "Condiciones obligatorias (ej. { id: 5 })" }
          },
          required: ["table", "data", "where"]
        }
      },
      {
        name: "delete_record",
        description: "Elimina registros de una tabla.",
        inputSchema: {
          type: "object",
          properties: { 
            table: { type: "string" },
            where: { type: "object", description: "Condiciones obligatorias (ej. { id: 5 })" }
          },
          required: ["table", "where"]
        }
      }
    ]
  };
});

// 4. Implementar ejecución de herramientas (Call Tool)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const checkSecurity = (action, whereClause) => {
      // 1. Control de permisos por entorno
      if ((action === 'DELETE' || action === 'DROP') && APP_ENV === 'prod') {
        throw new Error(`[SEGURIDAD] La operación ${action} está estrictamente bloqueada en el entorno de producción.`);
      }
      // 2. Límites de seguridad (Safeguards)
      if (action === 'UPDATE' || action === 'DELETE') {
        if (!whereClause || Object.keys(whereClause).length === 0) {
          throw new Error(`[SEGURIDAD] Es obligatorio proporcionar una condición (WHERE) para la operación ${action}.`);
        }
      }
    };

    if (name === "insert_record") {
      const { table, data } = args;
      checkSecurity('INSERT');
      const [rows] = await pool.query('INSERT INTO ?? SET ?', [table, data]);
      return { content: [{ type: "text", text: JSON.stringify({ affectedRows: rows.affectedRows, insertId: rows.insertId }, null, 2) }] };
    }

    if (name === "update_record") {
      const { table, data, where } = args;
      checkSecurity('UPDATE', where);
      const conditions = [];
      const values = [table, data];
      for (const [key, val] of Object.entries(where)) {
        conditions.push(`?? = ?`);
        values.push(key, val);
      }
      const query = `UPDATE ?? SET ? WHERE ${conditions.join(' AND ')} LIMIT 100`;
      const [rows] = await pool.query(query, values);
      return { content: [{ type: "text", text: JSON.stringify({ affectedRows: rows.affectedRows }, null, 2) }] };
    }

    if (name === "delete_record") {
      const { table, where } = args;
      checkSecurity('DELETE', where);
      const conditions = [];
      const values = [table];
      for (const [key, val] of Object.entries(where)) {
        conditions.push(`?? = ?`);
        values.push(key, val);
      }
      const query = `DELETE FROM ?? WHERE ${conditions.join(' AND ')} LIMIT 100`;
      const [rows] = await pool.query(query, values);
      return { content: [{ type: "text", text: JSON.stringify({ affectedRows: rows.affectedRows }, null, 2) }] };
    }

    if (name === "list_tables") {
      const [rows] = await pool.query("SHOW TABLES");
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
    
    if (name === "describe_table") {
      const { table_name } = args;
      const [rows] = await pool.query(`DESCRIBE ??`, [table_name]);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    if (name === "get_foreign_keys") {
      const { table_name } = args;
      const dbName = getEnv('MYSQL_DB');
      const query = `
        SELECT 
          COLUMN_NAME, 
          REFERENCED_TABLE_NAME, 
          REFERENCED_COLUMN_NAME 
        FROM 
          INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE 
          TABLE_SCHEMA = ? 
          AND TABLE_NAME = ? 
          AND REFERENCED_TABLE_NAME IS NOT NULL;
      `;
      const [rows] = await pool.query(query, [dbName, table_name]);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    if (name === "read_workbench_model") {
      let { model_name } = args;
      const modelsDir = process.env.MODELS_DIR;
      if (!modelsDir) {
        throw new Error("La variable de entorno MODELS_DIR no está configurada.");
      }

      if (!model_name.endsWith(".mwb")) {
        model_name += ".mwb";
      }

      const filePath = path.join(modelsDir, model_name);

      if (!fs.existsSync(filePath)) {
        throw new Error(`No se pudo encontrar el modelo en la ruta: ${filePath}`);
      }

      // Descomprimir el archivo .mwb y buscar el documento XML
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      const xmlEntry = zipEntries.find(entry => entry.entryName.includes('.xml'));
      
      if (!xmlEntry) {
        throw new Error("No se encontró ningún archivo XML dentro del modelo de Workbench.");
      }

      const xmlData = zip.readAsText(xmlEntry);
      
      // Parsear el XML a JSON
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "_" });
      const jsonObj = parser.parse(xmlData);
      
      return { content: [{ type: "text", text: JSON.stringify(jsonObj, null, 2) }] };
    }
    
    if (name === "execute_read_query") {
      const { sql } = args;
      let finalSql = sql.trim();
      
      // Validación de seguridad para permitir solo consultas SELECT, SHOW o DESCRIBE
      const queryUpper = finalSql.toUpperCase();
      if (!queryUpper.startsWith("SELECT") && !queryUpper.startsWith("SHOW") && !queryUpper.startsWith("DESCRIBE")) {
        throw new Error("Operación denegada. Solo se permiten consultas de tipo SELECT.");
      }
      
      // Paginación automática: si es un SELECT y no tiene LIMIT explícito, limitar a 100
      if (queryUpper.startsWith("SELECT") && !/\bLIMIT\b/i.test(finalSql)) {
        // Quitamos el punto y coma final si lo hay para poder añadir el LIMIT
        finalSql = finalSql.replace(/;+$/, '') + " LIMIT 100";
      }
      
      const [rows] = await pool.query(finalSql);
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
  console.error(`Custom MySQL MCP Server corriendo en Stdio... (Entorno: ${APP_ENV})`);
}

run().catch(console.error);
