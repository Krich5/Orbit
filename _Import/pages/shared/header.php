<?php
if (isset($_GET['action']) && $_GET['action'] === 'webex-status') {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: public, max-age=300');
  $ctx = stream_context_create(['http' => ['timeout' => 8, 'user_agent' => 'CXAS-StatusBanner/1.0', 'ignore_errors' => true]]);
  $xml_str = @file_get_contents('https://status.webex.com/history.rss', false, $ctx);
  if ($xml_str === false) { echo json_encode(['error' => 'fetch failed', 'items' => []]); exit; }
  libxml_use_internal_errors(true);
  $rss = simplexml_load_string($xml_str);
  if (!$rss) { echo json_encode(['error' => 'parse failed', 'items' => []]); exit; }
  $items = [];
  foreach ($rss->channel->item ?? [] as $item) {
    $desc = (string)($item->description ?? '');
    $status = 'unknown';
    $type = 'maintenance';
    // The description lists all status updates newest-first. Extract all <strong> tag
    // contents in order and use the first one matching a known status word, so we
    // always pick the most recent update (not an older "investigating" buried at the end).
    preg_match_all('/<strong\s*>\s*([^<]+?)\s*<\/strong\s*>/i', $desc, $sm_all);
    $known = ['investigating','identified','monitoring','resolved','postmortem','in progress','scheduled','completed'];
    $firstStatus = '';
    foreach ($sm_all[1] as $sm_match) {
      $candidate = strtolower(trim($sm_match));
      if (in_array($candidate, $known)) { $firstStatus = $candidate; break; }
    }
    if ($firstStatus === 'investigating' || $firstStatus === 'identified' || $firstStatus === 'monitoring') {
      $status = 'in_progress'; $type = 'incident';
    } elseif ($firstStatus === 'resolved' || $firstStatus === 'postmortem') {
      $status = 'completed'; $type = 'incident';
    } elseif ($firstStatus === 'in progress') { $status = 'in_progress'; }
    elseif ($firstStatus === 'scheduled')     { $status = 'scheduled'; }
    elseif ($firstStatus === 'completed')     { $status = 'completed'; }
    $regions = [];
    if (preg_match('/Regions?[^<]*<\/strong[^>]*>[^<]*<\/font[^>]*>\s*(.*?)\s*<br/i', $desc, $rm)) {
      foreach (preg_split('/,\s*/', strip_tags($rm[1])) as $r) {
        $r = trim($r); if ($r !== '') $regions[] = $r;
      }
    }
    $items[] = ['title' => (string)($item->title ?? ''), 'link' => (string)($item->link ?? ''), 'status' => $status, 'type' => $type, 'regions' => $regions];
  }
  echo json_encode(['items' => $items, 'fetched' => gmdate('c')]);
  exit;
}

require_once '/var/projects/bitbucket.io/cxasteam.bitbucket.io/oauth/check_access.php';

$tp_header_prefix = isset($tp_header_prefix) ? rtrim($tp_header_prefix, '/') . '/' : '../../';
$tp_show_auth_link = !empty($tp_show_auth_link);

$tp_calling_links = [
  ['label' => 'Workspaces', 'href' => 'pages/wxc/workspaces.html'],
  ['label' => 'Locations', 'href' => 'pages/wxc/locations.html'],
  ['label' => 'Numbers', 'href' => 'pages/wxc/number.html'],
  ['label' => 'Usage & Activity', 'href' => 'pages/wxc/usage.html'],
  ['label' => 'Virtual Lines', 'href' => 'pages/wxc/virtuallines.html'],
  ['label' => 'Users', 'href' => 'pages/wxc/user.html'],
  ['label' => 'Devices', 'href' => 'pages/wxc/devices.html'],
  ['label' => 'Auto Attendant', 'href' => 'pages/wxc/autoattendant.html'],
];

// Webex Messages -- Space History Export moved out of Calling into its
// own group and its own folder (pages/wxmessages/).
$tp_messages_links = [
  ['label' => 'Space History Export', 'href' => 'pages/wxmessages/spacehistory.html'],
];

// Admin section sub-links (rendered inside the Account/Admin accordion).
$tp_admin_links = [
  ['label' => 'Create WxC As-Built',  'href' => 'pages/asbuilt/wxc.html'],
  ['label' => 'Create WxCC As-Built', 'href' => 'pages/asbuilt/wxcc.html'],
];

$tp_contact_links = [
  ['label' => 'Queues', 'href' => 'pages/wxcc/queues.html'],
  ['label' => 'Business Hours', 'href' => 'pages/wxcc/businesshours.html'],
  ['label' => 'Contact Center Users', 'href' => 'pages/wxcc/contactcenterusers.html'],
  ['label' => 'Skills', 'href' => 'pages/wxcc/skills.html'],
  ['label' => 'Desktop Profiles', 'href' => 'pages/wxcc/desktopprofiles.html'],
  ['label' => 'Channels', 'href' => 'pages/wxcc/channels.html'],
  ['label' => 'Flows', 'href' => 'pages/wxcc/flows.html'],
  ['label' => 'Functions', 'href' => 'pages/wxcc/functions.html'],
  ['label' => 'Address Book', 'href' => 'pages/wxcc/addressbook.html'],
  ['label' => 'Search API', 'href' => 'pages/wxcc/searchapi.html'],
  ['label' => 'Outbound Campaign Manager', 'href' => 'pages/wxcc/ocm.html'],
  ['label' => 'Supervisor Controls', 'href' => 'pages/wxcc/supervisorcontrols.html'],
  ['label' => 'Epoch Time', 'href' => 'pages/wxcc/epochtime.html'],
  ['label' => 'Realtime Dashboard', 'href' => 'pages/wxcc/realtime-dashboard.html'],
  ['label' => 'Historical Data', 'href' => 'pages/wxcc/historical-data.html'],
  ['label' => 'Desktop Layout', 'href' => 'pages/wxcc/desktoplayout.html'],
  ['label' => 'Contact Center Building Wizard', 'href' => 'pages/wxcc/wizard/S1_Teams.html'],
];

$tp_aiagent_links = [
  ['label' => 'AI Bot Visualizer', 'href' => 'pages/aiagent/visualizer.html'],
  ['label' => 'AI Call Transcript Summary', 'href' => 'pages/aiagent/summary.html'],
  ['label' => 'AI Utilization', 'href' => 'pages/aiagent/utilization.html'],
  ['label' => 'Autonomous Instructions Builder', 'href' => 'pages/aiagent/autonomous.html'],
  ['label' => 'AI Agent Calculator', 'href' => 'pages/aiagent/agent-calculator.html'],
];

$tp_meetings_links = [
  ['label' => 'Meeting Transcriptions', 'href' => 'pages/meetings/transcriptions.html'],
];
?>
<header class="tp-header">
  <div class="tp-header-inner">
    <div class="left">
      <a class="tp-logo" href="<?php echo htmlspecialchars($tp_header_prefix, ENT_QUOTES, 'UTF-8'); ?>home.html" aria-label="OpsHub — Home">
        <img src="<?php echo htmlspecialchars($tp_header_prefix, ENT_QUOTES, 'UTF-8'); ?>assets/images/OpsHub_transparent.png" class="logo" alt="OpsHub" />
      </a>
    </div>
    <div class="right">
      <div class="tp-header-actions">
        <img class="tp-user-avatar" id="tpUserAvatar" alt="" aria-hidden="true">
        <div class="tp-user-info">
          <div class="tp-user-name" id="userName">Signed in</div>
          <div class="tp-user-org" id="userOrg"></div>
        </div>
      </div>
    </div>
  </div>
</header>
<?php if ($tp_show_auth_link): ?>
<script>window.API_TOOLS_SHOW_AUTH_LINK = true;</script>
<?php endif; ?>
<?php if (in_array($_SESSION['webex_user']['email'] ?? '', ['krichardson@cxsol.com'])): ?>
<script>window.OPSHUB_IS_ADMIN_USER = true;</script>
<?php endif; ?>
<div id="wxStatusBanner" class="wx-status-banner" data-proxy-url="<?php echo htmlspecialchars($tp_header_prefix . 'pages/shared/header.php?action=webex-status', ENT_QUOTES, 'UTF-8'); ?>">
  <div class="wx-status-inner">
    <div class="wx-status-label-area">
      <span class="wx-status-dot" id="wxStatusDot"></span>
      <a class="wx-status-title" href="https://status.webex.com" target="_blank" rel="noopener" aria-label="View Webex status page">Webex Status</a>
    </div>
    <div class="wx-status-ticker-outer" aria-live="polite" aria-atomic="false">
      <div class="wx-status-ticker" id="wxStatusTicker"></div>
    </div>
    <button class="wx-status-close" id="wxStatusClose" type="button" aria-label="Close Webex status banner">&#x2715;</button>
  </div>
</div>
