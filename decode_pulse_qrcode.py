import sys

import base64
import deflate
import zxing

def decode_pulse_str(pulse_str: str) -> str:
    binary = bytes.fromhex(pulse_str)
    # Inflate
    data = deflate.gzip_decompress(binary)
    # Decode base64
    data = base64.b64decode(data)
    return data

def read_pulse_str_from_qrcode(file_path: str) -> str:
    reader = zxing.BarCodeReader()
    barcode = reader.decode(file_path)
    url: str = barcode.parsed
    pulse_str = url.split("#DGLAB-PULSE#")[1]

    return pulse_str

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python decode_pulse_qrcode.py <qrcode_image>")
        sys.exit(1)

    file_path = sys.argv[1]
    pulse_str = read_pulse_str_from_qrcode(file_path)
    data = decode_pulse_str(pulse_str)
    print(data)