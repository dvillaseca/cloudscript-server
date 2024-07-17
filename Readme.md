# Playfab CloudScript Server
A command line program for running your cloudscript code locally  

Has stack traces for Javascript and API errors  
Listens to file changes and restarts the server to reflect the latest changes
## Usage

First install the package:  
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
This package allows running a websocket server for running the cloudscript file in a remote location for faster responses if the server is located closer to the playfab servers (currently: Azure US West 2)  

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

5º Remember to open the port declared above in your server to the internet

This is a very complex feature and can have bugs, please if you find any report them  
**I tried to keep it secure but due to the nature of the feature (remote code execution) do not, for any reason, run this server in any place you have sensitive data or any sensitive services**

### Conecting to the remote server
In your cloudscript project folder add to your .env file the following variables:  
>REMOTE_SERVER_URL = wss//:{your_domain}:{your_port}  
>REMOTE_SERVER_AUTH = {your_password}  

final run:
>cloudscript-server remote



## Disclaimer
This server should not be used in production, it will not work, the currentPlayerId is setted as a global variable, so if a new request arrive to the server while another request is processing the currentPlayerId will be changed and things will break, in fact, only one user can use this server at a time because of this.  

Depending of your location and the amount of api request in your handler this server can be really slow due the higher latency between your location and the playfab servers (currently Quincy, Washington).  

This package is arriving a litte late, it should have been done by Playfab ages ago, but better late than never...
