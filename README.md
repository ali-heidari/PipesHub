# PipesHub

NodeJS service to make other services communicate through it.

Run the server and derive class from client. **Clients available in JavaScript, Java and Python**

JavaScript: https://github.com/ali-heidari/PipesClientJS

Python: https://github.com/ali-heidari/PipesClientPython

Java: https://github.com/ali-heidari/PipesClientJava

## Usage client

1. request
    - Invoke an operation on the end-side without expecting a return.
2. ask
    - Invoke an operation on the end-side with expecting a return.
3. persist
    - Invoke an operation on end-side no immediate return but receives for incoming messages at any time.

## Process

1. The client connects to REST API of server and gets a JWT with a valid secret key
2. The Client handshakes with socket part of the server with JWT as an authorization header
3. The client use one of 3 types of communication. Described in the Usage Client section
