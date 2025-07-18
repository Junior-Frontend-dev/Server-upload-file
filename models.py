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
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.filename,
            'originalName': self.original_name,
            'size': self.file_size,
            'type': self.file_type,
            'created': self.upload_date.isoformat() if self.upload_date else None,
            'downloads': self.download_count
        }