import base64
import hashlib
import json
import os
import platform

from base64 import b64encode,b64decode
from Cryptodome import  Random

from Cryptodome.PublicKey import RSA
# from Cryptodome.Cipher import PKCS1_OAEP
from Cryptodome.Cipher import PKCS1_v1_5
from Cryptodome.Util.Padding import pad,unpad

def rsa_encrypt(pubkey, raw):
    cipher_rsa = PKCS1_v1_5.new(RSA.import_key(pubkey))
    data = base64.b64encode(raw.encode('utf-8'))
    encrypted = cipher_rsa.encrypt(data)
    b64_encrypted = base64.b64encode(encrypted).decode('utf-8')
    
    return b64_encrypted

# decode -> decrypt
def rsa_decrypt(privkey, encrypted):
    cipher_rsa = PKCS1_v1_5.new(RSA.import_key(privkey))
    encrypted_data = encrypted.encode('utf-8')
    base64_data = base64.b64decode(encrypted_data)
    data = cipher_rsa.decrypt(base64_data,0)
    raw = data.decode('utf-8')

    return raw

def generate_key():
    key = RSA.generate(2048)
    private_key = key.export_key()
    public_key = key.publickey().export_key()

    return public_key.decode('utf-8'), private_key.decode('utf-8')