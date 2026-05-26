'use client';

import { useEffect, useState } from 'react';
import './dashboard.css';

export default function Dashboard() {
  const [data, setData] = useState({ applications: [], jobs: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pipeline');

  useEffect(() => {
    fetch('/api/data')
      .then(r => r.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="logo">
          <div className="logo-dot"></div>
          Pipeline / Matthew Golia
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary">
            ⚡ Run Scraper
          </button>
        </div>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('pipeline')}
        >
          Applications
        </button>
        <button 
          className={`tab ${activeTab === 'scraper' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          Scraper Feed
        </button>
        <button 
          className={`tab ${activeTab === 'gmail' ? 'active' : ''}`}
          onClick={() => setActiveTab('gmail')}
        >
          Gmail Scan
        </button>
      </div>

      <main>
        {activeTab === 'pipeline' && (
          <div>
            <h2>Applications ({data.applications.length})</h2>
            {data.applications.length === 0 ? (
              <p>No applications found.</p>
            ) : (
              <table className="pipeline-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Date Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {data.applications.map(app => (
                    <tr key={app.id}>
                      <td>{app.app_number}</td>
                      <td>{app.company}</td>
                      <td>{app.role}</td>
                      <td><span className={`status-badge status-${app.status?.toLowerCase().replace(/\s+/g, '-')}`}>{app.status}</span></td>
                      <td>{app.date_applied ? new Date(app.date_applied).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'scraper' && (
          <div>
            <div className="scraper-header">
              <div>
                <div className="scraper-title">Scraper Feed</div>
                <div className="scraper-sub">New roles found in the last 2 days — not yet applied</div>
              </div>
              <button className="btn btn-primary">⚡ Run Now</button>
            </div>
            <div>
              {data.jobs.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No new jobs scraped yet.</p>
              ) : (
                <div className="jobs-grid">
                  {data.jobs.map(job => (
                    <div key={job.id} className="job-card">
                      <div className="job-card-header">
                        <div className="job-company">{job.company_name}</div>
                        <div className="job-title">{job.job_title}</div>
                      </div>
                      {job.salary && <div className="job-salary">{job.salary}</div>}
                      {job.location && <div className="job-location">{job.location}</div>}
                      {job.scraped_at && (
                        <div className="job-meta">
                          Scraped {new Date(job.scraped_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'gmail' && (
          <div className="scan-panel">
            <div className="scan-panel-title">Scan Gmail for recruiter updates</div>
            <div className="scan-panel-sub">Searches your inbox for replies, rejections, interview requests, and status changes since your last session.</div>
            <button className="btn btn-primary">
              Scan Inbox
            </button>
          </div>
        )}
      </main>
    </>
  );
}
