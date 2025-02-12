import os
import pigpio
import time
from dotenv import load_dotenv
from flask import Flask, redirect, render_template, Response
from flask_basicauth import BasicAuth
from webcam import WebCam

load_dotenv()
app = Flask(__name__)
app.config["BASIC_AUTH_USERNAME"] = os.getenv("USERNAME")
app.config["BASIC_AUTH_PASSWORD"] = os.getenv("PASSWORD")
basic_auth = BasicAuth(app)
servo_pin = 17
pi = pigpio.pi()
pi.set_mode(servo_pin, pigpio.OUTPUT)

def generate(camera):
	while True:
		frame = camera.get_frame()
		yield (b"--frame\r\n"
			   b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n\r\n")

@app.after_request
def add_header(response):
	response.headers["Cache-Control"] = "no-store, must-revalidate"
	response.cache_control.max_age = 0
	response.cache_control.public = True
	return response

@app.route("/")
@basic_auth.required
def index():
	return render_template("index.html")

@app.route("/video_feed")
@basic_auth.required
def video_feed():
	return Response(generate(WebCam()), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/drop_treat")
@basic_auth.required
def drop_treat():
	pi.set_servo_pulsewidth(servo_pin, 1500) # stop servo
	time.sleep(0.5)
	pi.set_servo_pulsewidth(servo_pin, 1560) # spin servo
	time.sleep(0.5)
	pi.set_servo_pulsewidth(servo_pin, 1500) # stop servo
	return "DROPPED TREAT"

if __name__ == "__main__":
	app.run(host="0.0.0.0", port="80", threaded=True)