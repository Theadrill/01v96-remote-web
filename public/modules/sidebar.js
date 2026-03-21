function conn() { 
    socket.emit('requestConnect', { 
        inIdx: parseInt(document.getElementById('sin').value, 10), 
        outIdx: parseInt(document.getElementById('sout').value, 10) 
    }); 
    document.getElementById('configModal').style.display='none'; 
}

function forceSync() { 
    socket.emit('forceSync'); 
}

function toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) docElm.requestFullscreen();
        else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}
