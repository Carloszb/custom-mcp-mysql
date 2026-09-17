# Custom MySQL MCP Server

Este proyecto es un servidor local **Model Context Protocol (MCP)** desarrollado en Node.js. Permite que herramientas de IA (como **Antigravity**) se conecten a la base de datos MySQL de forma segura.

Por diseño, el código del servidor (`index.js`) tiene restricciones para **solo permitir consultas de lectura** (`SELECT`, `SHOW`, `DESCRIBE`), bloqueando de forma segura cualquier intento de modificación de datos (`INSERT`, `UPDATE`, `DELETE`).

## Requisitos previos

- **Node.js** (v18 o superior recomendado)
- **NPM** (incluido con Node.js)
- Acceso de red a la base de datos MySQL.

## Instrucciones de Instalación

Sigue estos pasos si acabas de clonar el repositorio y necesitas ponerlo en marcha en tu máquina local:

### 1. Instalar dependencias
Abre una terminal en esta carpeta y ejecuta:
```bash
npm install
```

### 2. Configurar las variables de entorno
El proyecto utiliza un archivo `.env` local para manejar los secretos y las credenciales.
1. Crea una copia del archivo `.env.example` y llámalo `.env`.
2. Rellena los datos de tu base de datos en el archivo `.env`:

### 3. Configurar Antigravity
El archivo de configuración `.agents/mcp_config.json` ya está incluido en el repositorio. Si ejecutas Antigravity (`agy`) abriendo la terminal en esta carpeta o en su directorio padre, el CLI debería detectar este servidor automáticamente.

Si necesitas registrarlo globalmente en tu máquina para usarlo desde cualquier otro directorio, puedes ejecutar el siguiente comando (sustituyendo la ruta por la ruta absoluta de tu equipo):

```bash
agy mcp add custom-sicam-db -- node C:/ruta/absoluta/a/custom-mcp-mysql/index.js
```

