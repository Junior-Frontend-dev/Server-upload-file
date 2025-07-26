import os
import hashlib
import mimetypes
import secrets
import string
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

def generate_hidden_token():
    """Generate a secure random token for hidden files"""
    return secrets.token_urlsafe(32)

def generate_simple_password(length=8):
    """Generate a simple password for files"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def check_view_limit_and_delete(file_record):
    """Check if file has reached view limit and delete if necessary"""
    if file_record.view_limit and file_record.view_count >= file_record.view_limit:
        try:
            filepath = os.path.join(UPLOAD_FOLDER, file_record.filename)
            if os.path.exists(filepath):
                os.remove(filepath)
            db.session.delete(file_record)
            db.session.commit()
            return True
        except Exception as e:
            app.logger.error(f"Error deleting file after view limit: {e}")
            db.session.rollback()
    return False

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
        # Check if this is a request for hidden files
        show_hidden = request.args.get('hidden') == 'true'
        admin_key = request.headers.get('Authorization') or request.args.get('adminKey')
        valid_key = os.environ.get('ADMIN_KEY', 'admin123')
        is_admin = admin_key == valid_key or admin_key == f'Bearer {valid_key}'
        
        # If requesting hidden files, require admin authentication
        if show_hidden and not is_admin:
            return jsonify({'error': 'Admin access required for hidden files'}), 403
        
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
                        
                        file_data = {
                            'name': filename,
                            'originalName': original_name,
                            'size': stat_info.st_size,
                            'type': mime_type,
                            'created': datetime.fromtimestamp(stat_info.st_ctime).isoformat(),
                            'modified': datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                            'isHidden': False,
                            'isPasswordProtected': False,
                            'viewCount': 0,
                            'viewLimit': None
                        }
                        
                        # Check database for additional metadata
                        try:
                            from models import File
                            file_record = File.query.filter_by(filename=filename).first()
                            if file_record:
                                file_data.update({
                                    'isHidden': file_record.is_hidden,
                                    'hiddenToken': file_record.hidden_token if is_admin else None,
                                    'isPasswordProtected': file_record.is_password_protected,
                                    'viewCount': file_record.view_count,
                                    'viewLimit': file_record.view_limit,
                                    'lastAccessed': file_record.last_accessed.isoformat() if file_record.last_accessed else None
                                })
                                
                                # Filter hidden files for non-admin users
                                if file_record.is_hidden and not is_admin and not show_hidden:
                                    continue
                        except Exception as e:
                            app.logger.error(f"Error fetching file metadata: {e}")
                        
                        files.append(file_data)
        
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
        
        # Get additional parameters for advanced features
        is_hidden = request.form.get('isHidden', 'false').lower() == 'true'
        view_limit = request.form.get('viewLimit')
        password = request.form.get('password')
        
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
                
                # Create database record with advanced features
                try:
                    from models import File
                    
                    file_record = File(
                        filename=filename,
                        original_name=original_filename,
                        file_size=stat_info.st_size,
                        file_type=file.content_type or mimetypes.guess_type(filepath)[0],
                        is_hidden=is_hidden,
                        hidden_token=generate_hidden_token() if is_hidden else None,
                        view_limit=int(view_limit) if view_limit and view_limit.isdigit() else None,
                        password_hash=generate_password_hash(password) if password else None,
                        is_password_protected=bool(password)
                    )
                    
                    db.session.add(file_record)
                    db.session.commit()
                    
                except Exception as e:
                    app.logger.error(f"Error creating file record: {e}")
                    # Continue without database record for backward compatibility
                
                uploaded_files.append({
                    'originalName': original_filename,
                    'filename': filename,
                    'size': stat_info.st_size,
                    'type': file.content_type or mimetypes.guess_type(filepath)[0],
                    'uploadTime': datetime.now().isoformat(),
                    'hash': file_hash,
                    'isHidden': is_hidden,
                    'viewLimit': int(view_limit) if view_limit and view_limit.isdigit() else None,
                    'isPasswordProtected': bool(password)
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
        # Check if this is a hidden file access
        token = request.args.get('token')
        password = request.form.get('password') or request.args.get('password')
        
        # Get file record from database
        file_record = None
        try:
            from models import File
            file_record = File.query.filter_by(filename=filename).first()
        except Exception as e:
            app.logger.error(f"Error fetching file record: {e}")
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            abort(404)
        
        # Check if file is hidden and requires token
        if file_record and file_record.is_hidden:
            if not token or token != file_record.hidden_token:
                return jsonify({'error': 'Invalid or missing access token'}), 403
        
        # Check if file is password protected
        if file_record and file_record.is_password_protected:
            if not password:
                return jsonify({'error': 'Password required', 'requiresPassword': True}), 401
            if not check_password_hash(file_record.password_hash, password):
                return jsonify({'error': 'Invalid password'}), 401
        
        # Update view count and check limits
        if file_record:
            file_record.view_count += 1
            file_record.last_accessed = datetime.utcnow()
            
            try:
                db.session.commit()
                
                # Check if file should be deleted after this view
                if check_view_limit_and_delete(file_record):
                    # File was deleted, but we can still serve this last download
                    pass
                    
            except Exception as e:
                app.logger.error(f"Error updating view count: {e}")
                db.session.rollback()
        
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
            
            # Also delete from database
            try:
                from models import File
                file_record = File.query.filter_by(filename=filename).first()
                if file_record:
                    db.session.delete(file_record)
                    db.session.commit()
            except Exception as e:
                app.logger.error(f"Error deleting file record: {e}")
                db.session.rollback()
            
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

# New API endpoints for advanced features

@app.route('/api/files/<filename>/toggle-hidden', methods=['POST'])
@admin_required
def toggle_file_hidden(filename):
    """Toggle hidden status of a file"""
    try:
        from models import File
        file_record = File.query.filter_by(filename=filename).first()
        
        if not file_record:
            # Create record if it doesn't exist
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            if not os.path.exists(filepath):
                return jsonify({'error': 'File not found'}), 404
                
            stat_info = os.stat(filepath)
            file_record = File(
                filename=filename,
                original_name=filename,
                file_size=stat_info.st_size,
                file_type=mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
            )
            db.session.add(file_record)
        
        file_record.is_hidden = not file_record.is_hidden
        if file_record.is_hidden and not file_record.hidden_token:
            file_record.hidden_token = generate_hidden_token()
        elif not file_record.is_hidden:
            file_record.hidden_token = None
            
        db.session.commit()
        
        return jsonify({
            'message': f'File {"hidden" if file_record.is_hidden else "made public"}',
            'isHidden': file_record.is_hidden,
            'hiddenToken': file_record.hidden_token,
            'shareUrl': f"{request.host_url}api/download/{filename}?token={file_record.hidden_token}" if file_record.is_hidden else None
        })
        
    except Exception as e:
        app.logger.error(f"Error toggling hidden status: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to toggle hidden status'}), 500

@app.route('/api/files/<filename>/set-password', methods=['POST'])
@admin_required
def set_file_password(filename):
    """Set or update password for a file"""
    try:
        data = request.get_json()
        password = data.get('password', '').strip()
        
        from models import File
        file_record = File.query.filter_by(filename=filename).first()
        
        if not file_record:
            # Create record if it doesn't exist
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            if not os.path.exists(filepath):
                return jsonify({'error': 'File not found'}), 404
                
            stat_info = os.stat(filepath)
            file_record = File(
                filename=filename,
                original_name=filename,
                file_size=stat_info.st_size,
                file_type=mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
            )
            db.session.add(file_record)
        
        if password:
            file_record.password_hash = generate_password_hash(password)
            file_record.is_password_protected = True
            message = 'Password set successfully'
        else:
            file_record.password_hash = None
            file_record.is_password_protected = False
            message = 'Password removed successfully'
            
        db.session.commit()
        
        return jsonify({
            'message': message,
            'isPasswordProtected': file_record.is_password_protected
        })
        
    except Exception as e:
        app.logger.error(f"Error setting password: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to set password'}), 500

@app.route('/api/files/<filename>/set-view-limit', methods=['POST'])
@admin_required
def set_view_limit(filename):
    """Set view limit for a file"""
    try:
        data = request.get_json()
        view_limit = data.get('viewLimit')
        
        if view_limit is not None and (not isinstance(view_limit, int) or view_limit < 0):
            return jsonify({'error': 'View limit must be a positive integer or null'}), 400
        
        from models import File
        file_record = File.query.filter_by(filename=filename).first()
        
        if not file_record:
            # Create record if it doesn't exist
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            if not os.path.exists(filepath):
                return jsonify({'error': 'File not found'}), 404
                
            stat_info = os.stat(filepath)
            file_record = File(
                filename=filename,
                original_name=filename,
                file_size=stat_info.st_size,
                file_type=mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
            )
            db.session.add(file_record)
        
        file_record.view_limit = view_limit
        db.session.commit()
        
        return jsonify({
            'message': f'View limit {"set to " + str(view_limit) if view_limit else "removed"}',
            'viewLimit': file_record.view_limit,
            'viewCount': file_record.view_count
        })
        
    except Exception as e:
        app.logger.error(f"Error setting view limit: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to set view limit'}), 500

@app.route('/api/files/<filename>/reset-views', methods=['POST'])
@admin_required
def reset_view_count(filename):
    """Reset view count for a file"""
    try:
        from models import File
        file_record = File.query.filter_by(filename=filename).first()
        
        if not file_record:
            return jsonify({'error': 'File record not found'}), 404
        
        file_record.view_count = 0
        db.session.commit()
        
        return jsonify({
            'message': 'View count reset successfully',
            'viewCount': file_record.view_count,
            'viewLimit': file_record.view_limit
        })
        
    except Exception as e:
        app.logger.error(f"Error resetting view count: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to reset view count'}), 500

@app.route('/api/files/<filename>/generate-share-link', methods=['POST'])
@admin_required
def generate_share_link(filename):
    """Generate a shareable link for a file"""
    try:
        from models import File
        file_record = File.query.filter_by(filename=filename).first()
        
        if not file_record:
            return jsonify({'error': 'File record not found'}), 404
        
        base_url = f"{request.host_url}api/download/{filename}"
        
        if file_record.is_hidden:
            share_url = f"{base_url}?token={file_record.hidden_token}"
        else:
            share_url = base_url
            
        return jsonify({
            'shareUrl': share_url,
            'isHidden': file_record.is_hidden,
            'isPasswordProtected': file_record.is_password_protected,
            'viewLimit': file_record.view_limit,
            'viewCount': file_record.view_count
        })
        
    except Exception as e:
        app.logger.error(f"Error generating share link: {e}")
        return jsonify({'error': 'Failed to generate share link'}), 500

@app.route('/h/<token>')
def hidden_file_access(token):
    """Access hidden files via token"""
    try:
        from models import File
        file_record = File.query.filter_by(hidden_token=token).first()
        
        if not file_record or not file_record.is_hidden:
            abort(404)
        
        # Redirect to download with token
        return redirect(f"/api/download/{file_record.filename}?token={token}")
        
    except Exception as e:
        app.logger.error(f"Error accessing hidden file: {e}")
        abort(500)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)