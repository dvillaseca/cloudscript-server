# Playfab CloudScript Server
A command line program for running your cloudscript code locally  

Has stack traces for Javascript and API errors  
Listens to file changes and restarts the server to reflect the latest changes
## Usage

First, install the package globally:  
>npm install -g cloudscript-server

This service requires 2 environment variables:  
>TITLE_ID = "your project title id"  
>TITLE_SECRET = "your project developer secret"  

You can use a **.env** file in the same cloudscript project folder for setting up the environment variables, if you do this, remember to add the **.env** file to the **.ignore** file for your repository to avoid sensitive keys leaking 

Then run the program in your cloudscript project directory: 
>cloudscript-server  

The default port of the server is **8080**, this can be changed by passing a **-p** or **--port** argument to the program 

You can also use a **-d** or **--dir** argument to point to your cloudscript project folder 

For testing in the editor you have to set in your **PlafabSharedSettings.asset** the **ProductionEnvironmentUrl** to http://127.0.0.1:8080  

## Extra features  
For generating typescript typings you can run:
>cloudscript-server typings  

For publishing a minified version directly to playfab run:
>cloudscript-server publish  

Use a **.cloudscriptignore** file for ignoring files during the publishing process, this file is only used during the publish process, uses the same format as a .gitignore file

## Remote Server

### Server Setup
This package allows running a WebSocket server to execute the CloudScript file in a remote location for faster responses if the server is located closer to the PlayFab servers (currently: Azure US West 2).

**Server configuration instructions:**  

1º Install docker and docker-compose  
2º Clone this respository in your server  
3º Create a .env file in the same cloudscript-server folder with the following variables:
>REMOTE_SERVER_DOMAIN = {your_domain}  
>REMOTE_SERVER_AUTH = {a_secret_password}  
>REMOTE_SERVER_PORT = {your_port}  

4º Run the flowing commands:

>docker-compose build  
>docker-compose up -d  

5º Open the port declared above on your server to the internet.

This is a complex feature and can have bugs. If you find any, please report them.  
**Do not, for any reason, run this server in any place where you have sensitive data or any sensitive services due to the nature of remote code execution.**

### Conecting to the remote server
In your CloudScript project folder, add the following variables to your .env file:  
>REMOTE_SERVER_URL = wss//:{your_domain}:{your_port}  
>REMOTE_SERVER_AUTH = {your_password}  

final run:
>cloudscript-server remote



## Disclaimer
This server should not be used in production. It will not work properly because the currentPlayerId is set as a global variable. If a new request arrives while another request is processing, the currentPlayerId will be changed and things will break. In fact, only one user can use this server at a time because of this limitation.

Depending on your location and the number of API requests in your handler, this server can be slow due to the higher latency between your location and the PlayFab servers (currently Quincy, Washington).

This package is arriving a little late; it should have been done by PlayFab ages ago, but better late than never...
