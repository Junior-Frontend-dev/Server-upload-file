from app import db
from datetime import datetime


class File(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    file_type = db.Column(db.String(100), nullable=False)
    upload_date = db.Column(db.DateTime, default=datetime.utcnow)
    download_count = db.Column(db.Integer, default=0)
    
    # New fields for advanced features
    is_hidden = db.Column(db.Boolean, default=False)
    hidden_token = db.Column(db.String(64), unique=True, nullable=True)
    view_limit = db.Column(db.Integer, nullable=True)  # None means no limit
    view_count = db.Column(db.Integer, default=0)
    password_hash = db.Column(db.String(255), nullable=True)
    is_password_protected = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.String(100), default='admin')
    last_accessed = db.Column(db.DateTime, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.filename,
            'originalName': self.original_name,
            'size': self.file_size,
            'type': self.file_type,
            'created': self.upload_date.isoformat() if self.upload_date else None,
            'downloads': self.download_count,
            'isHidden': self.is_hidden,
            'hiddenToken': self.hidden_token,
            'viewLimit': self.view_limit,
            'viewCount': self.view_count,
            'isPasswordProtected': self.is_password_protected,
            'lastAccessed': self.last_accessed.isoformat() if self.last_accessed else None
        }