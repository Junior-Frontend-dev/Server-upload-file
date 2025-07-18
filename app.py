import os
import hashlib
import mimetypes
from datetime import datetime
from functools import wraps

from flask import Flask, request, jsonify, send_file, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

# create the app
app = Flask(__name__, static_folder='public', static_url_path='')
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1) # needed for url_for to generate with https

# configure the database, relative to the app instance folder
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///app.db")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

# File upload configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar', 'mp3', 'mp4', 'avi'}

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# initialize the app with the extension, flask-sqlalchemy >= 3.0.x
db.init_app(app)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        admin_key = request.headers.get('Authorization') or request.args.get('adminKey')
        valid_key = os.environ.get('ADMIN_KEY', 'admin123')
        
        if admin_key == valid_key or admin_key == f'Bearer {valid_key}':
            return f(*args, **kwargs)
        else:
            return jsonify({'error': 'Access denied. Admin key required.'}), 403
    return decorated_function

def generate_file_hash(filepath):
    """Generate SHA-256 hash for a file"""
    try:
        with open(filepath, 'rb') as f:
            file_hash = hashlib.sha256()
            while chunk := f.read(8192):
                file_hash.update(chunk)
        return file_hash.hexdigest()
    except Exception:
        return None

# Import models and create tables
with app.app_context():
    try:
        import models  # noqa: F401
        db.create_all()
    except ImportError:
        pass

# Routes

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/admin')
def admin():
    return send_from_directory('public', 'admin.html')

@app.route('/api/files', methods=['GET'])
def get_files():
    """Get all files with metadata"""
    try:
        files = []
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                if filename != '.gitkeep':
                    filepath = os.path.join(UPLOAD_FOLDER, filename)
                    if os.path.isfile(filepath):
                        stat_info = os.stat(filepath)
                        mime_type = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
                        
                        # Remove timestamp from display name
                        original_name = filename
                        if '_' in filename:
                            parts = filename.rsplit('_', 1)
                            if len(parts) == 2 and parts[1].replace('.', '').isdigit():
                                # This looks like our timestamp format
                                original_name = parts[0] + ('' if '.' not in parts[1] else '.' + parts[1].split('.', 1)[1])
                        
                        files.append({
                            'name': filename,
                            'originalName': original_name,
                            'size': stat_info.st_size,
                            'type': mime_type,
                            'created': datetime.fromtimestamp(stat_info.st_ctime).isoformat(),
                            'modified': datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                        })
        
        return jsonify(files)
    except Exception as e:
        app.logger.error(f"Error getting files: {e}")
        return jsonify({'error': 'Error reading directory'}), 500

@app.route('/api/upload', methods=['POST'])
@admin_required
def upload_files():
    """Upload one or more files"""
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No files in request'}), 400
        
        files = request.files.getlist('files')
        if not files or all(file.filename == '' for file in files):
            return jsonify({'error': 'No files selected'}), 400
        
        uploaded_files = []
        total_size = 0
        
        for file in files:
            if file and file.filename and allowed_file(file.filename):
                # Secure the filename and add timestamp
                original_filename = secure_filename(file.filename)
                timestamp = int(datetime.now().timestamp() * 1000)
                name, ext = os.path.splitext(original_filename)
                filename = f"{name}_{timestamp}{ext}"
                
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                file.save(filepath)
                
                # Get file stats
                stat_info = os.stat(filepath)
                file_hash = generate_file_hash(filepath)
                
                uploaded_files.append({
                    'originalName': original_filename,
                    'filename': filename,
                    'size': stat_info.st_size,
                    'type': file.content_type or mimetypes.guess_type(filepath)[0],
                    'uploadTime': datetime.now().isoformat(),
                    'hash': file_hash
                })
                total_size += stat_info.st_size
        
        if not uploaded_files:
            return jsonify({'error': 'No valid files uploaded'}), 400
        
        return jsonify({
            'message': f'{len(uploaded_files)} file(s) uploaded successfully.',
            'files': uploaded_files,
            'totalSize': total_size
        })
        
    except Exception as e:
        app.logger.error(f"Upload error: {e}")
        return jsonify({'error': 'Upload failed'}), 500

@app.route('/api/download/<filename>')
def download_file(filename):
    """Download a specific file"""
    try:
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            abort(404)
        
        # Update download count if using database model
        return send_file(filepath, as_attachment=True, download_name=filename)
    except Exception as e:
        app.logger.error(f"Download error: {e}")
        abort(500)

@app.route('/api/delete/<filename>', methods=['DELETE'])
@admin_required
def delete_file(filename):
    """Delete a specific file"""
    try:
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'message': f'File {filename} deleted successfully'})
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        app.logger.error(f"Delete error: {e}")
        return jsonify({'error': 'Delete failed'}), 500

@app.route('/api/stats')
def get_stats():
    """Get storage statistics"""
    try:
        total_files = 0
        total_size = 0
        files = []
        
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                if filename != '.gitkeep':
                    filepath = os.path.join(UPLOAD_FOLDER, filename)
                    if os.path.isfile(filepath):
                        stat_info = os.stat(filepath)
                        size = stat_info.st_size
                        total_files += 1
                        total_size += size
                        files.append({
                            'name': filename,
                            'size': size,
                            'created': datetime.fromtimestamp(stat_info.st_ctime).isoformat()
                        })
        
        return jsonify({
            'totalFiles': total_files,
            'totalSize': total_size,
            'averageSize': total_size / total_files if total_files > 0 else 0,
            'files': files
        })
    except Exception as e:
        app.logger.error(f"Stats error: {e}")
        return jsonify({'error': 'Error getting statistics'}), 500

# Health check
@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)