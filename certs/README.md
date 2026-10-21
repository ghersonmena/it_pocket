# Certificados SSL

Coloca aquí los archivos del certificado (no se suben a git ni se copian a la imagen;
docker-compose los monta en el contenedor en `/etc/nginx/certs`). nginx usa dos archivos:

- `fullchain.crt` → tu certificado **seguido del certificado intermedio** de la autoridad que lo
  emitió (cadena completa). Con el certificado solo, sin el intermedio, los teléfonos Android
  rechazan la conexión.
- `privkey.key` → la llave privada **sin contraseña** (nginx no puede pedirla al arrancar).

Para armar `fullchain.crt` a partir de tu certificado y el intermedio de tu autoridad
certificadora (lo publica la propia autoridad; si viene en formato DER, conviértelo a PEM):

    openssl x509 -inform DER -in intermedio.cer -out intermedio.pem   # solo si viene en DER
    cat tu_certificado.crt intermedio.pem > fullchain.crt

Para quitarle la contraseña a una llave:

    openssl rsa -in llave_con_contraseña.key -out privkey.key

## Solo para pruebas: certificado autofirmado

El navegador mostrará una advertencia y en el teléfono no funcionarán las notificaciones ni la
cámara, pero sirve para ver la app (por ejemplo, la versión demo):

    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout privkey.key -out fullchain.crt -subj "/CN=itpocket-local" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
